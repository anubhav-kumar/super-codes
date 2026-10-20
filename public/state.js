// In-memory app state + a tiny pub/sub. Nothing here touches the DOM.

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, data) {
  for (const fn of listeners.get(event) ?? []) {
    try {
      fn(data);
    } catch (err) {
      console.error(`listener for "${event}" failed`, err);
    }
  }
}

export const state = {
  base: null,         // normalized server base URL (ends with '/')
  C: null,            // lib/constants.js module from the server
  limits: null,       // server limits (health) merged over C.LIMITS
  author: null,       // validated name or null
  chats: new Map(),   // chatId -> ChatSummary
  currentChatId: null,
  health: null,       // last diagnosis result
  healthRunning: false,
  reachOk: true,      // result of the last quick reach check
  streams: { global: 'closed', chat: 'closed' },
};

export function sortedChats() {
  return [...state.chats.values()].sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt && a.lastMessageAt !== b.lastMessageAt) {
      return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
    }
    if (a.lastMessageAt && !b.lastMessageAt) return -1;
    if (!a.lastMessageAt && b.lastMessageAt) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// Messages of one open chat: Map by id + array ordered by id (string compare),
// plus the per-chat asset index and lookup caches.
export class ThreadData {
  constructor(chatId) {
    this.chatId = chatId;
    this.messages = new Map();
    this.order = [];
    this.assetIndex = new Map();   // assetId -> { asset, messageId }
    this.assetLookups = new Map(); // assetId -> Promise<{ asset, available } | null>
    this.headProbes = new Map();   // url -> Promise<boolean | null>
    this.hasMore = false;
  }

  has(id) {
    return this.messages.has(id);
  }

  get(id) {
    return this.messages.get(id);
  }

  // Returns the insertion index, or -1 when the id is already present.
  insert(msg) {
    if (this.messages.has(msg.id)) return -1;
    let lo = 0;
    let hi = this.order.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.order[mid] < msg.id) lo = mid + 1;
      else hi = mid;
    }
    this.order.splice(lo, 0, msg.id);
    this.messages.set(msg.id, msg);
    for (const asset of msg.assets ?? []) {
      if (!this.assetIndex.has(asset.id)) this.assetIndex.set(asset.id, { asset, messageId: msg.id });
    }
    return lo;
  }

  lastId() {
    return this.order.length ? this.order[this.order.length - 1] : null;
  }

  oldestId() {
    return this.order.length ? this.order[0] : null;
  }
}
