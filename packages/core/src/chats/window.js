import { MESSAGING_WINDOW_MS } from '../schemas/chat.js';

// WhatsApp only allows free-form replies within 24 h of the client's last message.
export function isWindowOpen(chat, now = Date.now()) {
  const last = Date.parse(chat?.lastClientMessageAt ?? '');
  if (Number.isNaN(last)) return false;
  return now - last < MESSAGING_WINDOW_MS;
}
