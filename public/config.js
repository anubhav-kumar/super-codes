// Settings persisted in localStorage: author name, per-chat last-seen id and drafts. Every access is
// guarded: when storage is unavailable (private mode, blocked) values live in memory for this page load only.

const KEY_AUTHOR = 'chat.author';
const lastSeenKey = (chatId) => `chat.lastSeen.${chatId}`;
const draftKey = (chatId) => `chat.draft.${chatId}`;

const memory = new Map();

export function storageGet(key) {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // fall through to memory
  }
  return memory.has(key) ? memory.get(key) : null;
}

export function storageSet(key, value) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // memory only
  }
}

export function storageRemove(key) {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function testRe(re, value) {
  return new RegExp(re.source, re.flags.replace('g', '').replace('y', '')).test(value);
}

export function getAuthor(C) {
  const name = storageGet(KEY_AUTHOR);
  return name && testRe(C.AUTHOR_RE, name) ? name : null;
}

export function setAuthor(name) {
  storageSet(KEY_AUTHOR, name);
}

export function getLastSeen(chatId) {
  return storageGet(lastSeenKey(chatId));
}

// Only moves forward: another tab may have seen further already.
export function setLastSeen(chatId, id) {
  const prev = getLastSeen(chatId);
  if (!prev || id > prev) storageSet(lastSeenKey(chatId), id);
}

export function getDraft(chatId) {
  return storageGet(draftKey(chatId)) ?? '';
}

export function setDraft(chatId, text) {
  if (text) storageSet(draftKey(chatId), text);
  else storageRemove(draftKey(chatId));
}

export function clearDraft(chatId) {
  storageRemove(draftKey(chatId));
}
