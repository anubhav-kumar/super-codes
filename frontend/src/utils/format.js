import { MONTHS, parseYmd } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');

const dayMonth = (d, m) => `${d} ${MONTHS[m - 1]}`;

/**
 * Display date: "25 Nov 2026" (one format across the app). `{ short: true }` drops the year when it
 * is the current year ("25 Nov"). Plain "YYYY-MM-DD" strings are split into parts, never parsed
 * through Date (which would shift the day by time zone); Date objects and ISO date-times use the
 * device's local date.
 */
export function formatDate(value, { short = false } = {}) {
    if (!value) return '';
    let parts = typeof value === 'string' ? parseYmd(value) : null;
    if (!parts) {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        parts = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    }
    if (short && parts.y === new Date().getFullYear()) return dayMonth(parts.d, parts.m);
    return `${dayMonth(parts.d, parts.m)} ${parts.y}`;
}

/** Display date-time in the device's local time: "25 Nov 2026, 14:05" (24-hour; `seconds` adds ":ss"). */
export function formatDateTime(value, { seconds = false } = {}) {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`;
    return `${formatDate(d)}, ${time}`;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * INR with Indian grouping, e.g. ₹1,23,456.00. Empty string for null/undefined.
 * `{ paise: 'auto' }` drops ".00" for whole amounts (₹8,108, ₹1,628.50).
 */
export function formatMoney(value, { paise = 'always' } = {}) {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (paise === 'auto' && Math.round(n * 100) % 100 === 0) return inrWhole.format(n);
    return inr.format(n);
}


/**
 * Indian words for large amounts, used in the money read-back: 150000 -> "1.5 lakh",
 * 1500000 -> "15 lakh", 25000000 -> "2.5 crore". '' below 1 lakh or for invalid values.
 * Rounded down to 2 decimals so the words never overstate the amount.
 */
export function formatLakh(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 100000) return '';
    // Divide by the unit / 100 first, so the floor works on whole hundredths (no float drift).
    if (n >= 10000000) return `${Math.floor(n / 100000) / 100} crore`;
    return `${Math.floor(n / 1000) / 100} lakh`;
}

/** Indian digit grouping of a string of digits: "1500000" -> "15,00,000". */
function groupIndian(digits) {
    if (digits.length <= 3) return digits;
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${rest},${last3}`;
}

/**
 * Regroups a typed amount for display in an input: "1500000.5" -> "15,00,000.5". The decimals are
 * kept as typed. Anything that is not a plain non-negative amount is returned unchanged, so invalid
 * input stays visible for its validation message.
 */
export function groupMoneyInput(value) {
    const raw = String(value ?? '');
    const v = raw.replace(/[,\s₹]/g, '');
    const match = /^(\d+)(\.\d*)?$/.exec(v);
    if (!match) return raw;
    const whole = match[1].replace(/^0+(?=\d)/, '');
    return `${groupIndian(whole)}${match[2] || ''}`;
}
