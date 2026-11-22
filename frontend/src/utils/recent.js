/**
 * "Recently opened" records, kept on this device only (F-21).
 *
 * localStorage key `ca-crm.recent` holds up to MAX_ENTRIES entries, newest first, one per record:
 *   { type, id, title, subtitle }   type = 'person' | 'company' | 'order' | 'invoice' | 'worker'
 * It holds client names, so it stays minimal and is removed on sign-out (auth/clearLocalData.js).
 * Storage errors (private mode, quota, blocked storage) are ignored: the list is a convenience.
 */

const KEY = 'ca-crm.recent';
const MAX_ENTRIES = 8;
const CHANGE_EVENT = 'ca-crm:recent-change';

export const RECENT_TYPES = {
    person: { icon: 'person', label: 'Person', path: (id) => `/people/${id}` },
    company: { icon: 'company', label: 'Company', path: (id) => `/companies/${id}` },
    order: { icon: 'orders', label: 'Order', path: (id) => `/orders/${id}` },
    invoice: { icon: 'invoices', label: 'Invoice', path: (id) => `/invoices/${id}` },
    worker: { icon: 'workers', label: 'Worker', path: (id) => `/workers/${id}` },
};

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

function isEntry(e) {
    return Boolean(e) && Boolean(RECENT_TYPES[e.type]) && text(e.id) !== '' && text(e.title) !== '';
}

function read() {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
        return [];
    }
}

function write(entries) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {
        // Storage blocked or full: skip.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

const same = (a, type, id) => a.type === type && String(a.id) === String(id);

/** Entries newest first: [{ type, id, title, subtitle }]. */
export function listRecent() {
    return read();
}

/** Moves (or adds) the record to the top. Only the fields Home shows are kept. */
export function recordVisit({ type, id, title, subtitle }) {
    const entry = { type, id: text(id), title: text(title), subtitle: text(subtitle) };
    if (!isEntry(entry)) return;
    const current = read();
    const top = current[0];
    if (top && same(top, type, id) && top.title === entry.title && top.subtitle === entry.subtitle) return;
    write([entry, ...current.filter((e) => !same(e, type, id))]);
}

/** Drops one record (e.g. it was opened and no longer exists). */
export function removeRecent(type, id) {
    const current = read();
    const next = current.filter((e) => !same(e, type, id));
    if (next.length !== current.length) write(next);
}

/** Calls `listener` when the list changes in this tab or another tab. Returns an unsubscribe function. */
export function subscribeRecent(listener) {
    const onStorage = (e) => {
        if (e.key === null || e.key === KEY) listener();
    };
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, listener);
        window.removeEventListener('storage', onStorage);
    };
}

/** Link to a recent entry's record. */
export function recentPath(entry) {
    const t = RECENT_TYPES[entry.type];
    return t ? t.path(encodeURIComponent(entry.id)) : '/';
}

const join = (...parts) => parts.map(text).filter(Boolean).join(' · ');

/** Title and subtitle of a loaded record, per type (what Home shows; nothing else is stored). */
export function describeRecord(type, r) {
    if (!r) return null;
    switch (type) {
        case 'person':
            return { title: r.name, subtitle: r.isIndividualClient ? 'Individual client' : 'Person' };
        case 'company':
            return { title: r.name, subtitle: 'Company' };
        case 'order':
            return { title: r.serviceName || r.orderNumber || 'Order', subtitle: join(r.orderNumber, r.client && r.client.name) };
        case 'invoice':
            return { title: r.invoiceNumber || 'Invoice', subtitle: join('Invoice', r.billedTo && r.billedTo.name) };
        case 'worker':
            return { title: r.name, subtitle: 'Worker' };
        default:
            return null;
    }
}
