const pad = (n) => String(n).padStart(2, '0');

/** Formats a date/ISO string in the device's local time as YYYY-MM-DD HH:mm:ss (24-hour). */
export function formatDateTime(value, { seconds = true } = {}) {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`;
    return `${date} ${time}`;
}

/**
 * Formats a date as YYYY-MM-DD. Plain "YYYY-MM-DD" strings are returned as is
 * (never parsed through Date, which would shift the day by time zone).
 */
export function formatDate(value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
