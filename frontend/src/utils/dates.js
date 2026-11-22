// Date-only helpers. Values are "YYYY-MM-DD" strings; they are split into parts and handled in UTC,
// never parsed through `new Date('YYYY-MM-DD')`, so the device time zone can't shift the day.

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" -> { y, m, d } (m is 1-12), or null when the string is not a real calendar date. */
export function parseYmd(value) {
    const match = typeof value === 'string' ? YMD_RE.exec(value) : null;
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
    return { y, m, d };
}

const toUtcMs = ({ y, m, d }) => Date.UTC(y, m - 1, d);

const fromUtcMs = (ms) => {
    const t = new Date(ms);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** The device's local calendar date as "YYYY-MM-DD". */
export function todayLocal(now = new Date()) {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "YYYY-MM-DD" plus n days (n may be negative). Returns '' for an invalid date. */
export function addDays(ymd, n) {
    const p = parseYmd(ymd);
    if (!p) return '';
    return fromUtcMs(toUtcMs(p) + n * DAY_MS);
}

/** Whole days from a to b (b - a), both "YYYY-MM-DD". null when either is invalid. */
export function daysBetween(a, b) {
    const pa = parseYmd(a);
    const pb = parseYmd(b);
    if (!pa || !pb) return null;
    return Math.round((toUtcMs(pb) - toUtcMs(pa)) / DAY_MS);
}

/** "2026-11-25" -> "Tue, 25 Nov 2026". '' for an invalid date. */
export function formatDateLong(ymd) {
    const p = parseYmd(ymd);
    if (!p) return '';
    const weekday = WEEKDAYS[new Date(toUtcMs(p)).getUTCDay()];
    return `${weekday}, ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

/**
 * Relative wording for a date against today: "today", "tomorrow", "yesterday", "in 15 days",
 * "3 days ago". '' for an invalid date.
 */
export function relativeDays(ymd, today = todayLocal()) {
    const days = daysBetween(today, ymd);
    if (days === null) return '';
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days === -1) return 'yesterday';
    return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
