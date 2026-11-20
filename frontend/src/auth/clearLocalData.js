import { clearAll } from '../offline/db.js';

const API_CACHE = 'api-get';

/**
 * Removes every copy of client data kept on the device: the service worker's API cache
 * and the IndexedDB data store and outbox. Used on sign-out and when the session ends,
 * so the next person on this device never sees the previous user's data.
 */
export async function clearLocalData() {
    const tasks = [clearAll().catch(() => {})];
    if (typeof caches !== 'undefined') tasks.push(caches.delete(API_CACHE).catch(() => {}));
    await Promise.all(tasks);
}
