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
const inrCrore = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 1 });

const CRORE = 10000000;
const toPaise = (n) => Math.round(n * 100);

/**
 * INR with Indian grouping. Empty string for null/undefined/invalid. Display only: callers keep
 * summing and comparing exact values. `paise`:
 *   'auto' (default) - 2 decimals only when the paise are non-zero (₹8,108, ₹1,628.50); forms, toasts.
 *   'none'           - whole rupees, nearest rupee (₹14,82,300); rows, cells, figures, captions.
 *                      A non-zero amount that would round to ₹0 keeps its paise (₹0.40).
 *   'always'         - always 2 decimals (₹7,700.00).
 */
export function formatMoney(value, { paise = 'auto' } = {}) {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (paise === 'none') return Math.abs(n) < 0.5 && toPaise(n) !== 0 ? inr.format(n) : inrWhole.format(n);
    if (paise === 'auto' && toPaise(n) % 100 === 0) return inrWhole.format(n);
    return inr.format(n);
}

/** True when the amount has non-zero paise (₹7,700.50, not ₹7,700 or ₹7,700.00). */
export function hasPaise(value) {
    if (value === null || value === undefined || value === '') return false;
    const n = Number(value);
    return Number.isFinite(n) && toPaise(n) % 100 !== 0;
}

/**
 * Key figure value: `{ text, full }`. `full` is the whole-rupee amount; `text` is the same, or from
 * ₹10 crore the short form "₹12.3 Cr" (one decimal, rounded down so it never overstates, ".0"
 * dropped). KeyFigures shows `full` as the tooltip and accessible name when they differ.
 */
export function formatFigure(value) {
    const full = formatMoney(value, { paise: 'none' });
    const n = Number(value);
    if (!full || Math.abs(n) < 10 * CRORE) return { text: full, full };
    const crore = Math.trunc(n / (CRORE / 10)) / 10;
    return { text: `${inrCrore.format(crore)} Cr`, full };
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
