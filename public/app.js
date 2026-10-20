// Entry: boot, routing, sidebar, header, dialogs, and wiring of thread/composer/streams.

import * as C from './lib/constants.js';
import { state, sortedChats, ThreadData } from './state.js';
import * as config from './config.js';
import * as api from './api.js';
import { ManagedStream } from './streams.js';
import { runDiagnosis, reachCheck, mergeLimits, CHECK_ORDER, CHECK_LABELS } from './health.js';
import { ThreadView } from './render.js';
import { Composer } from './composer.js';

const $ = (id) => document.getElementById(id);
const TAIL = 200;
const APP_TITLE = 'Agentic Chat';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const els = {
  bootScreen: $('boot-screen'),
  app: $('app'),
  sidebarToggle: $('sidebar-toggle'),
  sidebar: $('sidebar'),
  sidebarBackdrop: $('sidebar-backdrop'),
  conn: $('conn-indicator'),
  connLabel: $('conn-label'),
  connHost: $('conn-host'),
  connHint: $('conn-hint'),
  authorBtn: $('author-btn'),
  authorName: $('author-name'),
  settingsBtn: $('settings-btn'),
  newChatBtn: $('new-chat-btn'),
  newChatForm: $('new-chat-form'),
  newChatInput: $('new-chat-input'),
  newChatError: $('new-chat-error'),
  chatList: $('chat-list'),
  chatListEmpty: $('chat-list-empty'),
  main: $('main'),
  emptyState: $('empty-state'),
  emptyTitle: $('empty-title'),
  chatView: $('chat-view'),
  chatTitle: $('chat-title'),
  scroller: $('thread-scroller'),
  thread: $('thread'),
  threadStatus: $('thread-status'),
  loadOlder: $('load-older'),
  newPill: $('new-pill'),
  newCount: $('new-count'),
  nameDialog: $('name-dialog'),
  nameForm: $('name-form'),
  nameInput: $('name-input'),
  nameError: $('name-error'),
  nameLater: $('name-later'),
  connDialog: $('conn-dialog'),
  connClose: $('conn-close'),
  checkList: $('check-list'),
  serverInfo: $('server-info'),
  retestBtn: $('retest-btn'),
  lightbox: $('lightbox'),
  lightboxImg: $('lightbox-img'),
  lightboxOpen: $('lightbox-open'),
  lightboxClose: $('lightbox-close'),
};

let bootSeq = 0;
let globalStream = null;
let chatStream = null;
let session = null; // { chatId, data, abort, loaded, seenId, loadingOlder }
let notFoundChatId = null;
let hiddenAt = null;
let reachRetryTimer = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function testRe(re, value) {
  return typeof value === 'string' && new RegExp(re.source, re.flags.replace('g', '').replace('y', '')).test(value);
}

// Epoch ms from a ULID's first 10 chars (Crockford base32); NaN if malformed.
function ulidTimeMs(id) {
  let t = 0;
  for (const ch of String(id).slice(0, 10)) {
    const v = CROCKFORD.indexOf(ch);
    if (v < 0) return NaN;
    t = t * 32 + v;
  }
  return t;
}

// ---- validation of server data (light; the server is authoritative) -------

function isSummary(c) {
  return Boolean(c) && typeof c === 'object'
    && testRe(C.CHAT_ID_RE, c.id)
    && Number.isInteger(c.messageCount)
    && (c.lastMessageAt === null || typeof c.lastMessageAt === 'string');
}

function isAsset(a) {
  return Boolean(a) && typeof a === 'object'
    && testRe(C.ULID_RE, a.id)
    && typeof a.file === 'string'
    && typeof a.name === 'string'
    && typeof a.mime === 'string'
    && Number.isInteger(a.size);
}

function isMessage(m, chatId) {
  return Boolean(m) && typeof m === 'object'
    && testRe(C.ULID_RE, m.id)
    && m.chatId === chatId
    && testRe(C.ISO_TS_RE, m.ts)
    && typeof m.author === 'string'
    && typeof m.text === 'string'
    && Array.isArray(m.assets)
    && m.assets.every(isAsset);
}

function validMessages(list, chatId) {
  if (!Array.isArray(list)) return [];
  return list.filter((m) => {
    if (isMessage(m, chatId)) return true;
    console.warn('skipping invalid message from server', m?.id);
    return false;
  });
}

// ---- boot -----------------------------------------------------------------

// Same origin only (DESIGN §5.3): every URL is relative to the page's directory, so a path prefix works.
function boot() {
  bootSeq += 1;
  state.base = new URL('.', window.location.href).href;
  state.C = C;
  api.setBase(state.base);
  state.limits = mergeLimits(C, null);
  state.author = config.getAuthor(C);
  renderAuthor();
  renderHost();
  els.bootScreen.hidden = true;
  els.app.hidden = false;
  updateIndicator();

  // Health runs alongside the rest so the UI isn't blocked for the ~1–2 s the probes take.
  runHealth();
  startGlobalStream();
  route();
  if (!state.author) openNameDialog();
}

// ---- health & indicator ---------------------------------------------------

async function runHealth() {
  const seq = bootSeq;
  state.healthRunning = true;
  renderConnPanel();
  const onUpdate = (r) => {
    if (seq !== bootSeq) return;
    state.health = r;
    renderConnPanel();
  };
  const result = await runDiagnosis({ base: state.base, C, onUpdate });
  if (seq !== bootSeq) return;
  state.healthRunning = false;
  state.health = result;
  state.reachOk = result.checks.reach.ok !== false;
  state.reachError = result.checks.reach.error ?? null;
  if (result.server?.limits) state.limits = mergeLimits(C, result.server.limits);
  renderConnPanel();
  updateIndicator();
}

async function quickReach() {
  const seq = bootSeq;
  clearTimeout(reachRetryTimer);
  const r = await reachCheck(state.base);
  if (seq !== bootSeq) return;
  state.reachOk = r.reach.ok;
  state.reachError = r.reach.error ?? null;
  updateIndicator();
  if (!r.reach.ok) reachRetryTimer = setTimeout(quickReach, 10_000);
}

function computeConnection() {
  const streams = [state.streams.global];
  if (session?.loaded) streams.push(state.streams.chat);
  if (!state.reachOk || streams.includes('offline')) {
    return { kind: 'offline', label: 'offline', hint: state.reachError || 'Server unreachable — retrying' };
  }
  if (streams.includes('connecting') || state.streams.global === 'closed') return { kind: 'reconnecting', label: 'connecting', hint: '' };
  if (streams.includes('reconnecting')) return { kind: 'reconnecting', label: 'reconnecting', hint: 'Connection lost — reconnecting' };
  const h = state.health;
  if (h?.finishedAt && !h.ok) {
    const failed = CHECK_ORDER.map((n) => h.checks[n]).find((c) => c.ok === false);
    return { kind: 'degraded', label: 'degraded', hint: failed?.error ?? 'A connection check failed' };
  }
  return { kind: 'connected', label: 'connected', hint: '' };
}

function updateIndicator() {
  const c = computeConnection();
  els.conn.dataset.state = c.kind;
  els.connLabel.textContent = c.label;
  els.connHint.textContent = c.hint;
  els.connHint.hidden = !c.hint || c.kind === 'reconnecting';
  els.conn.title = c.hint ? `${c.label}: ${c.hint}. Click for details.` : `${c.label}. Click for connection details.`;
  els.conn.setAttribute('aria-label', `Connection ${c.label}${c.hint ? `: ${c.hint}` : ''}. Open connection details.`);
}

function renderHost() {
  const url = new URL(state.base);
  els.connHost.textContent = url.host + (url.pathname !== '/' ? url.pathname.replace(/\/$/, '') : '');
}

function fmtUptime(sec) {
  if (typeof sec !== 'number') return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [d && `${d}d`, (d || h) && `${h}h`, (d || h || m) && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

function openConnPanel() {
  if (!els.connDialog.open) els.connDialog.showModal();
  renderConnPanel();
}

function renderConnPanel() {
  if (!els.connDialog.open) return;
  const h = state.health;
  const items = CHECK_ORDER.map((name) => {
    const check = h?.checks?.[name];
    const li = el('li', 'check');
    let mark = '–';
    let kind = 'skip';
    if (!check || check.pending) {
      mark = '…';
      kind = 'pending';
    } else if (check.ok === true) {
      mark = '✓';
      kind = 'ok';
    } else if (check.ok === false) {
      mark = '✗';
      kind = 'fail';
    }
    li.dataset.kind = kind;
    const status = el('span', 'check-mark', mark);
    status.setAttribute('aria-label', { ok: 'passed', fail: 'failed', skip: 'skipped', pending: 'running' }[kind]);
    const label = el('span', 'check-label', CHECK_LABELS[name]);
    const ms = el('span', 'check-ms', check && !check.pending && check.ms ? `${check.ms} ms` : '');
    li.append(status, label, ms);
    if (check?.error) li.append(el('p', 'check-error', check.error));
    return li;
  });
  els.checkList.replaceChildren(...items);

  const server = h?.server;
  const rows = [
    ['Server', state.base],
    ['Version', server?.version ?? '—'],
    ['Protocol', `server ${server?.protocol ?? '—'} · UI ${C.PROTOCOL_VERSION}`],
    ['Uptime', fmtUptime(server?.uptimeSec)],
    ['Started', server?.startedAt ?? '—'],
    ['Checked', h?.finishedAt ? new Date(h.finishedAt).toLocaleTimeString([], { hour12: false }) : '—'],
  ];
  els.serverInfo.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, String(v))]));
  els.retestBtn.disabled = state.healthRunning;
  els.retestBtn.textContent = state.healthRunning ? 'Testing…' : 'Re-test';
}

// ---- global stream & chat list --------------------------------------------

function startGlobalStream() {
  globalStream = new ManagedStream({
    getUrl: () => api.apiUrl('api/stream'),
    events: { chat: onChatEvent },
    onOpen: () => {
      state.reachOk = true;
      state.reachError = null;
      loadChats();
      if (state.health?.finishedAt && !state.health.ok && !state.healthRunning) runHealth();
    },
    onStatus: (status) => {
      state.streams.global = status;
      updateIndicator();
    },
  });
  globalStream.start();
}

async function loadChats() {
  const seq = bootSeq;
  try {
    const body = await api.get('api/chats');
    if (seq !== bootSeq) return;
    const list = Array.isArray(body.chats) ? body.chats.filter(isSummary) : [];
    state.chats = new Map(list.map((c) => [c.id, c]));
    renderChatList();
    if (notFoundChatId && state.chats.has(notFoundChatId)) route();
  } catch (err) {
    console.warn('failed to load chats', err);
  }
}

function onChatEvent(event) {
  let summary;
  try {
    summary = JSON.parse(event.data);
  } catch {
    console.warn('skipping malformed chat event');
    return;
  }
  if (!isSummary(summary)) {
    console.warn('skipping invalid chat event', summary);
    return;
  }
  state.chats.set(summary.id, summary);
  renderChatList();
  if (notFoundChatId === summary.id) route();
}

function isUnread(chat) {
  if (chat.id === state.currentChatId) return false;
  if (!chat.messageCount || !chat.lastMessageAt) return false;
  const seen = config.getLastSeen(chat.id);
  if (!seen) return true;
  const seenMs = ulidTimeMs(seen);
  return Number.isNaN(seenMs) || Date.parse(chat.lastMessageAt) > seenMs;
}

function renderChatList() {
  const focusedHref = document.activeElement?.closest?.('#chat-list a')?.getAttribute('href');
  let unreadCount = 0;
  const items = sortedChats().map((chat) => {
    const li = el('li');
    const link = el('a', 'chat-link');
    link.href = `#/chat/${encodeURIComponent(chat.id)}`;
    link.append(el('span', 'chat-hash', '#'), el('span', 'chat-name', chat.id));
    if (chat.id === state.currentChatId) link.setAttribute('aria-current', 'page');
    if (isUnread(chat)) {
      unreadCount += 1;
      link.classList.add('unread');
      const dot = el('span', 'unread-dot');
      dot.title = 'unread';
      dot.append(el('span', 'sr-only', 'unread'));
      link.append(dot);
    }
    li.append(link);
    return li;
  });
  els.chatList.replaceChildren(...items);
  els.chatListEmpty.hidden = items.length > 0;
  if (focusedHref) els.chatList.querySelector(`a[href="${CSS.escape(focusedHref)}"]`)?.focus();
  document.title = unreadCount ? `(${unreadCount}) ${APP_TITLE}` : APP_TITLE;
}

// ---- new chat -------------------------------------------------------------

function openNewChat() {
  els.newChatBtn.hidden = true;
  els.newChatForm.hidden = false;
  els.newChatInput.value = '';
  els.newChatError.textContent = '';
  els.newChatInput.focus();
}

function closeNewChat() {
  els.newChatForm.hidden = true;
  els.newChatBtn.hidden = false;
  els.newChatInput.disabled = false;
}

function lowercaseInput(input) {
  const { selectionStart, selectionEnd } = input;
  const lower = input.value.toLowerCase();
  if (lower !== input.value) {
    input.value = lower;
    try {
      input.setSelectionRange(selectionStart, selectionEnd);
    } catch {
      // ignore
    }
  }
}

const CHAT_ID_RULE = 'Chat IDs use lowercase letters, digits and -, start with a letter or digit, max 64 characters.';

async function createChat() {
  const id = els.newChatInput.value.trim();
  if (!testRe(C.CHAT_ID_RE, id)) {
    els.newChatError.textContent = CHAT_ID_RULE;
    return;
  }
  els.newChatInput.disabled = true;
  els.newChatError.textContent = '';
  try {
    const body = await api.post('api/chats', { id });
    if (isSummary(body.chat)) {
      state.chats.set(body.chat.id, body.chat);
      renderChatList();
    }
    closeNewChat();
    navigate(id);
  } catch (err) {
    if (err.code === 'conflict' || err.status === 409) {
      closeNewChat();
      navigate(id);
      return;
    }
    els.newChatError.textContent = err.message;
    els.newChatInput.disabled = false;
    els.newChatInput.focus();
  }
}

// ---- routing --------------------------------------------------------------

function navigate(chatId) {
  const hash = `#/chat/${encodeURIComponent(chatId)}`;
  if (window.location.hash === hash) route();
  else window.location.hash = hash;
}

function parseRoute() {
  const hash = window.location.hash;
  if (!hash || hash === '#' || hash === '#/') return { kind: 'home' };
  const prefix = '#/chat/';
  if (!hash.startsWith(prefix)) return { kind: 'notfound' };
  let id;
  try {
    id = decodeURIComponent(hash.slice(prefix.length));
  } catch {
    return { kind: 'notfound' };
  }
  return testRe(C.CHAT_ID_RE, id) ? { kind: 'chat', chatId: id } : { kind: 'notfound' };
}

function route() {
  const r = parseRoute();
  closeSidebar();
  if (r.kind === 'chat') {
    if (session?.chatId === r.chatId) return;
    openChat(r.chatId);
    return;
  }
  closeChat();
  notFoundChatId = null;
  showEmpty(r.kind === 'home' ? 'Pick or create a chat' : 'Chat not found');
}

function showEmpty(text) {
  els.chatView.hidden = true;
  els.emptyState.hidden = false;
  els.emptyTitle.textContent = text;
  renderChatList();
}

// ---- thread ---------------------------------------------------------------

function setThreadStatus(text, { retry } = {}) {
  const box = els.threadStatus;
  box.replaceChildren();
  box.hidden = !text;
  if (!text) return;
  box.append(el('span', null, text));
  if (retry) {
    const btn = el('button', 'btn btn-small', 'Retry');
    btn.type = 'button';
    btn.addEventListener('click', retry);
    box.append(document.createTextNode(' '), btn);
  }
}

function closeChat() {
  if (!session) return;
  session.abort.abort();
  chatStream?.stop();
  chatStream = null;
  composer.setChat(null);
  session = null;
  state.currentChatId = null;
  state.streams.chat = 'closed';
  updateIndicator();
}

function markNotFound(chatId) {
  closeChat();
  notFoundChatId = chatId;
  showEmpty('Chat not found');
}

async function openChat(chatId) {
  closeChat();
  notFoundChatId = null;
  const data = new ThreadData(chatId);
  const s = { chatId, data, abort: new AbortController(), loaded: false, seenId: null, loadingOlder: false };
  session = s;
  state.currentChatId = chatId;
  els.emptyState.hidden = true;
  els.chatView.hidden = false;
  els.chatTitle.textContent = `# ${chatId}`;
  els.loadOlder.hidden = true;
  threadView.reset(data);
  composer.setChat(chatId);
  setThreadStatus('Loading messages…');
  renderChatList();

  let body;
  try {
    body = await api.get(api.chatPath(chatId, '/messages'), { query: { tail: TAIL }, signal: s.abort.signal });
  } catch (err) {
    if (session !== s || err.code === 'aborted') return;
    if (err.status === 404) {
      markNotFound(chatId);
      return;
    }
    setThreadStatus(`Couldn't load messages: ${err.message}`, {
      retry: () => {
        closeChat();
        openChat(chatId);
      },
    });
    return;
  }
  if (session !== s) return;
  data.hasMore = body.hasMore === true;
  setThreadStatus(null);
  threadView.setInitial(validMessages(body.messages, chatId));
  els.loadOlder.hidden = !data.hasMore;
  s.loaded = true;
  startChatStream(s);
  markSeen();
  if (!window.matchMedia('(max-width: 719px)').matches) composer.focus();
}

function startChatStream(s) {
  chatStream = new ManagedStream({
    // Always pass since so nothing falls between the fetch and the stream; native reconnects add Last-Event-ID.
    getUrl: () => api.apiUrl(api.chatPath(s.chatId, '/stream'), { since: s.data.lastId() ?? C.ZERO_ULID }),
    events: { message: (event) => onChatMessage(s, event) },
    onStatus: (status) => {
      if (session !== s) return;
      state.streams.chat = status;
      updateIndicator();
    },
    beforeRecreate: async () => {
      try {
        await api.get(api.chatPath(s.chatId), { signal: s.abort.signal });
        return session === s;
      } catch (err) {
        if (session !== s) return false;
        if (err.status === 404) {
          markNotFound(s.chatId);
          return false;
        }
        return true;
      }
    },
  });
  chatStream.start();
}

function onChatMessage(s, event) {
  if (session !== s) return;
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    console.warn('skipping malformed message event', String(event.data).slice(0, 200));
    return;
  }
  if (!isMessage(msg, s.chatId)) {
    console.warn('skipping invalid message event', msg?.id);
    return;
  }
  threadView.addLive(msg);
}

function markSeen() {
  const s = session;
  if (!s?.loaded || document.visibilityState !== 'visible' || !threadView.isNearBottom()) return;
  const last = s.data.lastId();
  if (!last || last === s.seenId) return;
  s.seenId = last;
  config.setLastSeen(s.chatId, last);
}

async function loadOlder() {
  const s = session;
  if (!s || s.loadingOlder || !s.data.oldestId()) return;
  s.loadingOlder = true;
  els.loadOlder.disabled = true;
  els.loadOlder.textContent = 'Loading…';
  let label = 'Load older';
  try {
    const body = await api.get(api.chatPath(s.chatId, '/messages'), {
      query: { before: s.data.oldestId(), tail: TAIL },
      signal: s.abort.signal,
    });
    if (session !== s) return;
    threadView.prependOlder(validMessages(body.messages, s.chatId));
    s.data.hasMore = body.hasMore === true;
  } catch (err) {
    if (session !== s || err.code === 'aborted') return;
    label = 'Load older (failed — retry)';
  } finally {
    if (session === s) {
      s.loadingOlder = false;
      els.loadOlder.disabled = false;
      els.loadOlder.textContent = label;
      els.loadOlder.hidden = !s.data.hasMore;
    }
  }
}

function lookupAsset(s, assetId) {
  const cache = s.data.assetLookups;
  if (!cache.has(assetId)) {
    const path = api.chatPath(s.chatId, `/assets/${encodeURIComponent(assetId)}`);
    cache.set(assetId, api.get(path, { signal: s.abort.signal })
      .then((body) => (isAsset(body?.asset) ? { asset: body.asset, available: body.available !== false } : null))
      .catch(() => null));
  }
  return cache.get(assetId);
}

function probeHead(s, url) {
  const cache = s.data.headProbes;
  if (!cache.has(url)) cache.set(url, api.headOk(url));
  return cache.get(url);
}

function openLightbox(src, name) {
  els.lightboxImg.src = src;
  els.lightboxImg.alt = name;
  els.lightboxOpen.href = src;
  els.lightbox.showModal();
}

// ---- identity -------------------------------------------------------------

function renderAuthor() {
  els.authorName.textContent = state.author ?? '(no name)';
}

function openNameDialog() {
  if (els.nameDialog.open) return;
  els.nameInput.value = state.author ?? '';
  els.nameError.textContent = '';
  els.nameDialog.showModal();
  els.nameInput.focus();
}

function saveName() {
  const name = els.nameInput.value.trim().toLowerCase();
  if (!testRe(C.AUTHOR_RE, name)) {
    els.nameError.textContent = 'That name doesn’t match the rule above.';
    els.nameInput.focus();
    return;
  }
  const changed = name !== state.author;
  config.setAuthor(name);
  state.author = name;
  renderAuthor();
  els.nameDialog.close();
  if (changed && session?.loaded) threadView.rerenderAll();
  composer.focus();
}

// ---- sidebar (narrow screens) ---------------------------------------------

function setSidebar(open) {
  els.app.classList.toggle('sidebar-open', open);
  els.sidebarToggle.setAttribute('aria-expanded', String(open));
  els.sidebarBackdrop.hidden = !open;
}

function closeSidebar() {
  setSidebar(false);
}

// ---- wiring ---------------------------------------------------------------

const threadView = new ThreadView({
  scroller: els.scroller,
  list: els.thread,
  pill: els.newPill,
  pillCount: els.newCount,
  getCtx: () => {
    const s = session;
    return {
      C,
      base: state.base,
      chatId: s?.chatId,
      author: state.author,
      lookupAsset: (id) => (s ? lookupAsset(s, id) : Promise.resolve(null)),
      probeHead: (url) => (s ? probeHead(s, url) : Promise.resolve(null)),
      openLightbox,
    };
  },
  onSeen: () => markSeen(),
});

const composer = new Composer({
  els: {
    form: $('composer'),
    textarea: $('message-input'),
    sendBtn: $('send-btn'),
    attachBtn: $('attach-btn'),
    fileInput: $('file-input'),
    attachments: $('attachments'),
    progress: $('upload-progress'),
    progressBar: $('upload-bar'),
    progressLabel: $('upload-label'),
    cancelBtn: $('upload-cancel'),
    error: $('composer-error'),
    dropZone: $('chat-view'),
    dropOverlay: $('drop-overlay'),
  },
  getCtx: () => ({ C, limits: state.limits ?? C.LIMITS, author: state.author }),
  getParticipants: () => {
    const names = [];
    const order = session?.data.order ?? [];
    for (let i = order.length - 1; i >= 0; i--) {
      const author = session.data.get(order[i])?.author;
      if (author && author !== state.author && !names.includes(author)) names.push(author);
    }
    return names;
  },
  onSent: (msg) => {
    if (session && msg && isMessage(msg, session.chatId)) {
      threadView.addLive(msg, { force: true });
      markSeen();
    }
  },
  onNeedAuthor: () => openNameDialog(),
  onRetest: () => {
    openConnPanel();
    runHealth();
  },
});

function bindUi() {
  window.addEventListener('hashchange', route);

  els.conn.addEventListener('click', openConnPanel);
  els.settingsBtn.addEventListener('click', openConnPanel);
  els.connClose.addEventListener('click', () => els.connDialog.close());
  els.retestBtn.addEventListener('click', () => {
    if (!state.healthRunning) runHealth();
  });
  els.authorBtn.addEventListener('click', openNameDialog);
  els.nameInput.addEventListener('input', () => {
    lowercaseInput(els.nameInput);
    const v = els.nameInput.value.trim();
    els.nameError.textContent = v && !testRe(C.AUTHOR_RE, v) ? 'Not a valid name yet.' : '';
  });
  els.nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveName();
  });
  els.nameLater.addEventListener('click', () => els.nameDialog.close());

  els.newChatBtn.addEventListener('click', openNewChat);
  els.newChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    createChat();
  });
  els.newChatInput.addEventListener('input', () => {
    lowercaseInput(els.newChatInput);
    const v = els.newChatInput.value.trim();
    els.newChatError.textContent = v && !testRe(C.CHAT_ID_RE, v) ? CHAT_ID_RULE : '';
  });
  els.newChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNewChat();
      els.newChatBtn.focus();
    }
  });

  els.loadOlder.addEventListener('click', loadOlder);

  els.sidebarToggle.addEventListener('click', () => setSidebar(!els.app.classList.contains('sidebar-open')));
  els.sidebarBackdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.app.classList.contains('sidebar-open')) closeSidebar();
  });

  els.lightbox.addEventListener('click', (e) => {
    if (e.target !== els.lightboxOpen) els.lightbox.close();
  });
  els.lightboxClose.addEventListener('click', () => els.lightbox.close());
  els.lightbox.addEventListener('close', () => els.lightboxImg.removeAttribute('src'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      composer.saveDraftNow();
      return;
    }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = null;
    markSeen();
    if (away > 60_000) quickReach();
  });
  window.addEventListener('pagehide', () => composer.saveDraftNow());
}

bindUi();
boot();
