import { isWindowOpen } from './window.js';

// F3: the only shape in which a chat leaves the API. Denylist, so fields added by other
// features (e.g. description, tags) pass through unchanged; anything phone-bearing is removed.
//   - chatId (the E.164 PK) and publicId are dropped; publicId is exposed as `id`.
//   - `phone` is added for admins only (D1).
//   - For agents, a clientName containing >= 5 digits is treated as missing (D5).
//   - displayName = clientName (as sanitized) or 'Client #XXXX' from the publicId (D3).
const CHAT_HIDDEN_FIELDS = ['chatId', 'publicId', 'phone'];
const DIGIT_RUN_LIMIT = 5;

export function looksLikePhone(value) {
  return (String(value ?? '').match(/\d/g) ?? []).length >= DIGIT_RUN_LIMIT;
}

export function fallbackDisplayName(publicId) {
  return publicId ? `Client #${publicId.slice(-4).toUpperCase()}` : 'Client';
}

// viewer: { role }. Missing `assignee`/`windowOpen` are left/computed as available.
export function toChatView(chat, viewer) {
  if (!chat) return null;
  const isAdmin = viewer?.role === 'admin';
  const view = { id: chat.publicId ?? null };
  for (const [key, value] of Object.entries(chat)) {
    if (!CHAT_HIDDEN_FIELDS.includes(key)) view[key] = value;
  }

  const rawName = typeof chat.clientName === 'string' ? chat.clientName.trim() : '';
  const clientName = rawName && (isAdmin || !looksLikePhone(rawName)) ? rawName : null;
  view.clientName = clientName;
  view.displayName = clientName || fallbackDisplayName(chat.publicId);
  if (!('windowOpen' in view)) view.windowOpen = isWindowOpen(chat);
  if (isAdmin) view.phone = chat.chatId ?? null;
  return view;
}
