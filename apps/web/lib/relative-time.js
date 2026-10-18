// F4: "just now" / "5 min ago" / "2 h ago" / "3 d ago", then an ISO date. Pair with
// formatFull() in a title attribute for the exact time.
import { formatDay } from './format.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(iso, now = Date.now()) {
  if (!iso) return '';
  const diff = now - Date.parse(iso);
  if (Number.isNaN(diff)) return '';
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} d ago`;
  return formatDay(iso);
}
