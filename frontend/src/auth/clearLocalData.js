import { clearAll, clearData } from '../offline/db.js';
import { stopOutboxReplay } from '../offline/outbox.js';

const API_CACHE = 'api-get';

// Device-only keys that hold client data. The sidebar choice (ca-crm.sidebar) is kept on purpose.
const CLIENT_DATA_KEYS = ['ca-crm.recent'];

// Id of the user the data on this device belongs to. Written after sign-in, removed only after
// everything is cleared, so a tab killed half-way through sign-out is cleaned up on the next start.
const DATA_OWNER_KEY = 'ca-crm.data-owner';

function removeKeys(keys) {
    try {
        for (const key of keys) window.localStorage.removeItem(key);
    } catch {
        // Storage blocked: nothing was stored there.
    }
}

async function clearCaches(withOutbox) {
    removeKeys(CLIENT_DATA_KEYS);
    const tasks = [(withOutbox ? clearAll() : clearData()).catch(() => {})];
    if (typeof caches !== 'undefined') tasks.push(caches.delete(API_CACHE).catch(() => {}));
    await Promise.all(tasks);
}

export function readDataOwner() {
    try {
        return window.localStorage.getItem(DATA_OWNER_KEY);
    } catch {
        return null;
    }
}

export function writeDataOwner(userId) {
    try {
        if (userId) window.localStorage.setItem(DATA_OWNER_KEY, String(userId));
    } catch {
        // Storage blocked: the start-up check then has nothing to compare, and sign-in still clears.
    }
}

/**
 * True when the data on this device may belong to someone other than `session`'s user: a marker
 * without a session, or a marker for another user. A session without a marker (signed in before the
 * marker existed) is trusted and gets the marker.
 */
export function dataOwnerMismatch(session) {
    const owner = readDataOwner();
    const userId = session && session.user ? session.user.id : null;
    if (!owner) {
        if (userId) writeDataOwner(userId);
        return false;
    }
    return !userId || String(userId) !== owner;
}

/**
 * Removes every copy of client data kept on the device: the service worker's API cache,
 * the IndexedDB data store and outbox, and the "recently opened" list. Used on sign-out, when the
 * session ends and when another user's data is found, so the next person on this device never sees
 * the previous user's data. A running outbox replay is stopped first.
 */
export async function clearLocalData() {
    await stopOutboxReplay().catch(() => {});
    await clearCaches(true);
    removeKeys([DATA_OWNER_KEY]);
}

/**
 * Same user, new role or Worker link (FR1 decision 21): drops data cached under the old scope
 * (API cache, data store, recently opened) and keeps that user's outbox and the owner marker.
 */
export async function clearScopedData() {
    await clearCaches(false);
}
