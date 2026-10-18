import { stripMediaInternals } from './media.js';

// F3: the only shape in which a message leaves the API. Denylist, so fields added by other
// features (e.g. media, reaction) pass through unchanged. chatId is the client's phone number
// and a wamid embeds it too, so neither is ever returned; statusRank is internal bookkeeping.
const MESSAGE_HIDDEN_FIELDS = ['chatId', 'waMessageId', 'statusRank'];

// viewer is accepted for symmetry with toChatView; the message view is the same for all roles.
export function toMessageView(message, _viewer) {
  if (!message) return null;
  const view = {};
  for (const [key, value] of Object.entries(message)) {
    if (!MESSAGE_HIDDEN_FIELDS.includes(key)) view[key] = value;
  }
  // F2: drop media.waMediaId / s3Key / sha256 (server-only), keep the rest of `media`.
  return stripMediaInternals(view);
}
