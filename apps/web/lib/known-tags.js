'use client';

import { useSyncExternalStore } from 'react';

// F4: tags seen on chats the user can already list, for autocomplete. Filled by the chat list
// on every poll; there is no global tag endpoint, so agents never discover tags used only on
// chats they cannot see. Catalog tags (phase 3) are added by the client panel.
let known = [];
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

export function rememberTags(tags) {
  const next = new Set(known);
  let changed = false;
  for (const tag of tags ?? []) {
    if (typeof tag === 'string' && !next.has(tag)) {
      next.add(tag);
      changed = true;
    }
  }
  if (!changed) return;
  known = [...next].sort((a, b) => a.localeCompare(b));
  emit();
}

export function rememberChatTags(chats) {
  rememberTags((chats ?? []).flatMap((chat) => chat.tags ?? []));
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY = [];

export function useKnownTags() {
  return useSyncExternalStore(
    subscribe,
    () => known,
    () => EMPTY,
  );
}
