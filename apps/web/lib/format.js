// Display helpers. 24-hour time and ISO dates, in the viewer's local timezone.

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTime(iso) {
  return iso ? timeFormat.format(new Date(iso)) : '';
}

export function formatDay(iso) {
  return iso ? isoDate(new Date(iso)) : '';
}

// Chat list: time for today, ISO date otherwise.
export function formatListTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return isoDate(date) === isoDate(new Date()) ? timeFormat.format(date) : isoDate(date);
}

export function chatTitle(chat) {
  return chat?.clientName || chat?.chatId || '';
}
