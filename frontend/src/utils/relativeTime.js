import { MONTHS } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');

const toDate = (value) => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole local calendar days from `d` to `now` (0 = same day, 1 = yesterday). */
const daysAgo = (d, now) => Math.round((startOfDay(now) - startOfDay(d)) / 86400000);

const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Local calendar day of an ISO date-time ("2026-11-23"), for grouping timeline entries by day.
 * Event times are ISO date-times, so they go through Date (device time zone), never parseYmd.
 */
export function localDayKey(iso) {
    const d = toDate(iso);
    if (!d) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Relative time in the device's local time zone (24-hour):
 * "Just now", "5 min ago", "2 h ago" (same day), "Yesterday, 14:05", "21 Nov, 14:05",
 * "21 Nov 2025, 14:05" (other years). Future times (clock skew) read "Just now".
 */
export function formatRelativeTime(iso, now = new Date()) {
    const d = toDate(iso);
    if (!d) return '';
    const minutes = Math.floor((now - d) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const days = daysAgo(d, now);
    if (days === 0) return `${Math.floor(minutes / 60)} h ago`;
    if (days === 1) return `Yesterday, ${hhmm(d)}`;
    const dayMonth = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    if (d.getFullYear() === now.getFullYear()) return `${dayMonth}, ${hhmm(d)}`;
    return `${dayMonth} ${d.getFullYear()}, ${hhmm(d)}`;
}

/** Day divider label: "Today", "Yesterday", or "21 Nov 2026" (device local time). */
export function dayLabel(iso, now = new Date()) {
    const d = toDate(iso);
    if (!d) return '';
    const days = daysAgo(d, now);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
