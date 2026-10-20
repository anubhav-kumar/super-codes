// Message, text and asset rendering (DESIGN §8–§10). DOM only: server data is only ever
// placed via textContent / attributes, never innerHTML.

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 80;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = {
  file: ['M6 2h8l6 6v14H6z', 'M14 2v6h6'],
  broken: ['M6 2h8l6 6v14H6z', 'M14 2v6h6', 'M9 13l6 6', 'M15 13l-6 6'],
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name}`);
  for (const d of ICON_PATHS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function formatSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function localDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function authorHue(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return hash % 360;
}

function testRe(re, value) {
  return new RegExp(re.source, re.flags.replace('g', '').replace('y', '')).test(value);
}

export function assetUrl(ctx, asset) {
  if (!asset || typeof asset.file !== 'string' || !testRe(ctx.C.ASSET_FILE_RE, asset.file)) return null;
  return new URL(`assets/${encodeURIComponent(ctx.chatId)}/${asset.file}`, ctx.base);
}

// ---- assets ---------------------------------------------------------------

export function renderUnavailable(asset, assetId) {
  const chip = el('span', 'asset-chip unavailable');
  chip.append(icon('broken'));
  const info = el('span', 'asset-info');
  const label = asset?.name ? asset.name : `asset:${asset?.id ?? assetId}`;
  info.append(el('span', 'asset-name', label));
  const size = asset ? formatSize(asset.size) : '';
  info.append(el('span', 'asset-meta', size ? `${size} · file not available` : 'file not available'));
  chip.append(info);
  chip.title = `asset:${asset?.id ?? assetId} (unavailable)`;
  return chip;
}

function renderImage(asset, url, ctx) {
  const wrap = el('button', 'asset-image');
  wrap.type = 'button';
  wrap.setAttribute('aria-label', `Open image ${asset.name}`);
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = asset.name;
  img.addEventListener('load', () => {
    wrap.classList.add('loaded');
    ctx.onMediaLoad?.();
  });
  img.addEventListener('error', () => {
    wrap.replaceWith(renderUnavailable(asset));
    ctx.onMediaLoad?.();
  });
  img.src = url.href;
  wrap.append(img);
  wrap.addEventListener('click', () => ctx.openLightbox?.(url.href, asset.name));
  return wrap;
}

function renderFileChip(asset, url, ctx) {
  const link = el('a', 'asset-chip');
  link.href = url.href;
  link.download = asset.name;
  link.rel = 'noopener noreferrer';
  link.append(icon('file'));
  const info = el('span', 'asset-info');
  info.append(el('span', 'asset-name', asset.name));
  info.append(el('span', 'asset-meta', [formatSize(asset.size), asset.mime].filter(Boolean).join(' · ')));
  link.append(info);
  ctx.probeHead?.(url.href).then((ok) => {
    if (ok === false && link.isConnected) link.replaceWith(renderUnavailable(asset));
  });
  return link;
}

export function renderAsset(asset, ctx, { available = true } = {}) {
  const url = assetUrl(ctx, asset);
  if (!available || !url) return renderUnavailable(asset);
  if (ctx.C.INLINE_IMAGE_EXTS.includes(ctx.C.extOf(asset.file))) return renderImage(asset, url, ctx);
  return renderFileChip(asset, url, ctx);
}

// Resolution order (DESIGN §10.1): this message → chat asset index → metadata lookup → unavailable.
function renderAssetRef(assetId, msg, ctx) {
  const own = (msg.assets ?? []).find((a) => a.id === assetId);
  if (own) return renderAsset(own, ctx);
  const indexed = ctx.data.assetIndex.get(assetId);
  if (indexed) return renderAsset(indexed.asset, ctx);
  const placeholder = el('span', 'asset-pending', `asset:${assetId}…`);
  placeholder.setAttribute('aria-label', 'Loading attachment');
  Promise.resolve(ctx.lookupAsset?.(assetId))
    .catch(() => null)
    .then((found) => {
      if (!placeholder.isConnected && !placeholder.parentNode) return;
      const node = found && found.asset
        ? renderAsset(found.asset, ctx, { available: found.available !== false })
        : renderUnavailable(null, assetId);
      placeholder.replaceWith(node);
      ctx.onMediaLoad?.();
    });
  return placeholder;
}

// ---- text -----------------------------------------------------------------

// Fenced code blocks: a line starting with ``` opens (optional language), a line that is just ``` closes;
// an unclosed fence runs to the end.
function splitFences(text) {
  const lines = text.split('\n');
  const parts = [];
  let buf = [];
  const flush = () => {
    if (buf.length) {
      const value = buf.join('\n');
      if (value) parts.push({ type: 'text', value });
      buf = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('```')) {
      buf.push(lines[i]);
      continue;
    }
    flush();
    const lang = lines[i].slice(3).trim();
    const code = [];
    i += 1;
    while (i < lines.length && lines[i].trim() !== '```') {
      code.push(lines[i]);
      i += 1;
    }
    parts.push({ type: 'code', lang, value: code.join('\n') });
  }
  flush();
  return parts;
}

function splitInlineCode(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'code', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

function renderCodeBlock(part) {
  const wrap = el('div', 'code-block');
  const bar = el('div', 'code-bar');
  bar.append(el('span', 'code-lang', part.lang || ''));
  const copy = el('button', 'code-copy', 'Copy');
  copy.type = 'button';
  copy.setAttribute('aria-label', 'Copy code');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(part.value);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed';
    }
    setTimeout(() => {
      copy.textContent = 'Copy';
    }, 1500);
  });
  bar.append(copy);
  const pre = el('pre');
  pre.append(el('code', null, part.value));
  wrap.append(bar, pre);
  return wrap;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function renderTokens(target, text, msg, ctx, referenced) {
  for (const token of ctx.C.tokenizeText(text)) {
    const value = String(token.value ?? '');
    if (token.type === 'mention') {
      const name = value.replace(/^@/, '');
      const span = el('span', name === ctx.author ? 'mention mention-me' : 'mention', `@${name}`);
      target.append(span);
    } else if (token.type === 'url') {
      const url = safeHttpUrl(value);
      if (!url) {
        target.append(document.createTextNode(value));
        continue;
      }
      const link = el('a', 'link', value);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      target.append(link);
    } else if (token.type === 'asset') {
      const assetId = value.replace(/^asset:/, '');
      if (!testRe(ctx.C.ULID_RE, assetId)) {
        target.append(document.createTextNode(value));
        continue;
      }
      referenced.add(assetId);
      target.append(renderAssetRef(assetId, msg, ctx));
    } else {
      target.append(document.createTextNode(value));
    }
  }
}

function renderText(text, msg, ctx, referenced) {
  const frag = document.createDocumentFragment();
  for (const block of splitFences(text)) {
    if (block.type === 'code') {
      frag.append(renderCodeBlock(block));
      continue;
    }
    const para = el('div', 'msg-text');
    for (const part of splitInlineCode(block.value)) {
      if (part.type === 'code') para.append(el('code', 'inline-code', part.value));
      else renderTokens(para, part.value, msg, ctx, referenced);
    }
    frag.append(para);
  }
  return frag;
}

// ---- messages -------------------------------------------------------------

export function renderMessage(msg, ctx) {
  const date = new Date(msg.ts);
  const row = el('article', 'msg');
  row.dataset.id = msg.id;
  row.dataset.author = msg.author;
  row.dataset.time = String(date.getTime());
  row.dataset.day = localDate(date);

  const sep = el('div', 'date-sep');
  sep.setAttribute('role', 'separator');
  sep.append(el('span', null, localDate(date)));
  row.append(sep);

  const head = el('div', 'msg-head');
  const author = el('span', 'msg-author', msg.author);
  author.style.setProperty('--hue', String(authorHue(msg.author)));
  const time = el('time', 'msg-time', localTime(date));
  time.dateTime = msg.ts;
  time.title = msg.ts;
  head.append(author, time);
  row.append(head);
  row.title = `${msg.author} · ${msg.ts}`;

  const body = el('div', 'msg-body');
  const referenced = new Set();
  if (msg.text) body.append(renderText(msg.text, msg, ctx, referenced));
  const rest = (msg.assets ?? []).filter((a) => !referenced.has(a.id));
  if (rest.length) {
    const row2 = el('div', 'msg-attachments');
    for (const asset of rest) row2.append(renderAsset(asset, ctx));
    body.append(row2);
  }
  row.append(body);

  if (ctx.author && ctx.C.extractMentions(msg.text ?? '').includes(ctx.author)) row.classList.add('mentions-me');
  return row;
}

export function renderMessageSafe(msg, ctx) {
  try {
    return renderMessage(msg, ctx);
  } catch (err) {
    console.warn('failed to render message', msg?.id, err);
    const row = el('article', 'msg msg-broken');
    row.dataset.id = msg?.id ?? '';
    row.append(el('div', 'msg-body', `Couldn't display this message (${msg?.id ?? 'unknown id'})`));
    return row;
  }
}

// ---- thread view ----------------------------------------------------------

export class ThreadView {
  constructor({ scroller, list, pill, pillCount, getCtx, onSeen }) {
    this.scroller = scroller;
    this.list = list;
    this.pill = pill;
    this.pillCount = pillCount;
    this.getCtx = getCtx;
    this.onSeen = onSeen;
    this.data = null;
    this.newCount = 0;
    this.pinned = true;
    scroller.addEventListener('scroll', () => this.handleScroll(), { passive: true });
    pill.addEventListener('click', () => this.scrollToBottom());
  }

  reset(data) {
    this.data = data;
    this.list.replaceChildren();
    this.newCount = 0;
    this.pinned = true;
    this.updatePill();
  }

  ctx() {
    return {
      ...this.getCtx(),
      data: this.data,
      onMediaLoad: () => {
        if (this.pinned) this.scrollToBottom();
      },
    };
  }

  isNearBottom() {
    const s = this.scroller;
    return s.scrollHeight - s.scrollTop - s.clientHeight <= NEAR_BOTTOM_PX;
  }

  scrollToBottom() {
    this.scroller.scrollTop = this.scroller.scrollHeight;
    this.pinned = true;
    this.newCount = 0;
    this.updatePill();
    this.onSeen?.();
  }

  handleScroll() {
    this.pinned = this.isNearBottom();
    if (this.pinned) {
      if (this.newCount) {
        this.newCount = 0;
        this.updatePill();
      }
      this.onSeen?.();
    }
  }

  updatePill() {
    this.pill.hidden = this.newCount === 0;
    this.pillCount.textContent = String(this.newCount);
  }

  // Inserts without scroll handling; returns how many were new.
  insertMany(messages, ctx = this.ctx()) {
    const touched = [];
    for (const msg of messages) {
      const index = this.data.insert(msg);
      if (index < 0) continue;
      const node = renderMessageSafe(msg, ctx);
      this.list.insertBefore(node, this.list.children[index] ?? null);
      touched.push(node);
    }
    if (touched.length > 20) this.decorateAll();
    else {
      for (const node of touched) {
        const index = Array.prototype.indexOf.call(this.list.children, node);
        this.decorate(index);
        this.decorate(index + 1);
      }
    }
    return touched.length;
  }

  setInitial(messages) {
    this.list.setAttribute('aria-busy', 'true');
    this.insertMany(messages);
    this.decorateAll();
    this.list.setAttribute('aria-busy', 'false');
    this.scrollToBottom();
  }

  prependOlder(messages) {
    const s = this.scroller;
    const fromBottom = s.scrollHeight - s.scrollTop;
    this.list.setAttribute('aria-busy', 'true');
    this.insertMany(messages);
    this.decorateAll();
    this.list.setAttribute('aria-busy', 'false');
    s.scrollTop = s.scrollHeight - fromBottom;
  }

  addLive(msg, { force = false } = {}) {
    const wasPinned = this.pinned || this.isNearBottom();
    if (this.insertMany([msg]) === 0) return false;
    if (force || wasPinned) this.scrollToBottom();
    else {
      this.newCount += 1;
      this.updatePill();
    }
    return true;
  }

  // Re-render every row (e.g. after the user's name changed, for mention highlights).
  rerenderAll() {
    const ctx = this.ctx();
    const nodes = this.data.order.map((id) => renderMessageSafe(this.data.get(id), ctx));
    this.list.replaceChildren(...nodes);
    this.decorateAll();
  }

  decorateAll() {
    const rows = this.list.children;
    for (let i = 0; i < rows.length; i++) this.decorate(i);
  }

  // Date separator when the local day changes; hide the header for same-author messages within 5 min.
  decorate(index) {
    const rows = this.list.children;
    const row = rows[index];
    if (!row) return;
    const prev = rows[index - 1];
    const sep = row.querySelector(':scope > .date-sep');
    const newDay = !prev || prev.dataset.day !== row.dataset.day;
    if (sep) sep.hidden = !newDay;
    const continued = Boolean(prev)
      && !newDay
      && !prev.classList.contains('msg-broken')
      && prev.dataset.author === row.dataset.author
      && Number(row.dataset.time) - Number(prev.dataset.time) < GROUP_WINDOW_MS;
    row.classList.toggle('continued', continued);
  }
}
