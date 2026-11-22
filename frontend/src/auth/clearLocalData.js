import { clearAll } from '../offline/db.js';

const API_CACHE = 'api-get';

// Device-only keys that hold client data. The sidebar choice (ca-crm.sidebar) is kept on purpose.
const CLIENT_DATA_KEYS = ['ca-crm.recent'];

/**
 * Removes every copy of client data kept on the device: the service worker's API cache,
 * the IndexedDB data store and outbox, and the "recently opened" list. Used on sign-out and
 * when the session ends, so the next person on this device never sees the previous user's data.
 */
export async function clearLocalData() {
    try {
        for (const key of CLIENT_DATA_KEYS) window.localStorage.removeItem(key);
    } catch {
        // Storage blocked: nothing was stored there.
    }
    const tasks = [clearAll().catch(() => {})];
    if (typeof caches !== 'undefined') tasks.push(caches.delete(API_CACHE).catch(() => {}));
    await Promise.all(tasks);
}
