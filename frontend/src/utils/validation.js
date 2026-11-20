const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
// Same rule as the backend (contract section 1.5).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizePan = (value) => String(value ?? '').trim().toUpperCase();

export const isValidPan = (value) => PAN_RE.test(normalizePan(value));

export const isValidEmail = (value) => {
    const v = String(value ?? '').trim();
    return v.length <= 254 && EMAIL_RE.test(v);
};

/** Loose phone check: 10 to 15 digits after removing spaces, "+" and "-". */
export const isValidPhone = (value) => /^\d{10,15}$/.test(String(value ?? '').replace(/[\s+-]/g, ''));

/**
 * Parses an INR amount typed by the user ("1,23,456.5" -> 123456.5).
 * Returns a number with at most 2 decimals, null for an empty value, or NaN when invalid.
 */
export function parseMoney(value) {
    const v = String(value ?? '').replace(/[,\s₹]/g, '');
    if (v === '') return null;
    if (!/^\d+(\.\d{0,2})?$/.test(v)) return Number.NaN;
    return Math.round(Number(v) * 100) / 100;
}
