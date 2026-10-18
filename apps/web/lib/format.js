// Display helpers. 24-hour time and ISO dates, in the viewer's local timezone.

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Whole calendar days between a date and today (0 = today, 1 = yesterday).
function daysAgo(date, now = new Date()) {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

export function formatTime(iso) {
  return iso ? timeFormat.format(new Date(iso)) : '';
}

export function formatDay(iso) {
  return iso ? isoDate(new Date(iso)) : '';
}

// Full timestamp for title tooltips: 2026-10-17 14:05.
export function formatFull(iso) {
  return iso ? `${formatDay(iso)} ${formatTime(iso)}` : '';
}

// Chat list: HH:mm today, "Yesterday", weekday within a week, ISO date otherwise.
export function formatListTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const days = daysAgo(date);
  if (days <= 0) return timeFormat.format(date);
  if (days === 1) return 'Yesterday';
  if (days < 7) return weekdayFormat.format(date);
  return isoDate(date);
}

// Conversation day divider: Today / Yesterday / ISO date.
export function formatDayLabel(iso) {
  if (!iso) return '';
  const days = daysAgo(new Date(iso));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return formatDay(iso);
}

// "5h 12m" / "38m" / "under a minute".
export function formatDuration(ms) {
  if (ms <= 60 * 1000) return 'under a minute';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

// F3: the server computes displayName (clientName, or 'Client #XXXX'); never a phone number.
export function chatTitle(chat) {
  return chat?.displayName || chat?.clientName || '';
}

// Up to two initials from a name; null when there is nothing name-like (e.g. only digits).
export function initials(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  if (!words.length) return null;
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : '';
  return `${first}${last}`.toUpperCase();
}

// Stable 1..8 colour slot for an id.
export function colorSlot(id) {
  let hash = 0;
  for (const ch of String(id ?? '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return (hash % 8) + 1;
}

// The last message came from the client (both fields are set from one timestamp on append).
export function isAwaitingReply(chat) {
  return Boolean(chat?.lastClientMessageAt) && chat.lastClientMessageAt === chat.lastMessageAt;
}
