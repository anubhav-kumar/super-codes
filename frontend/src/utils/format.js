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
