/**
 * IndexedDB access (frontend-architecture.md section 8.4), via the small `idb` wrapper.
 * Stores:
 *   data   - cached app data, keyed by a caller-chosen key
 *   outbox - queued offline writes, keyed by id (also the idempotency key)
 */
import { openDB } from 'idb';

const DB_NAME = 'ca-crm';
const DB_VERSION = 1;

let dbPromise = null;

export function getDb() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
                if (!db.objectStoreNames.contains('outbox')) {
                    const outbox = db.createObjectStore('outbox', { keyPath: 'id' });
                    outbox.createIndex('createdAt', 'createdAt');
                }
            },
        });
    }
    return dbPromise;
}

export async function getData(key) {
    return (await getDb()).get('data', key);
}

export async function setData(key, value) {
    return (await getDb()).put('data', value, key);
}

/** Clears the data store only; queued writes stay (e.g. the same user's role changed). */
export async function clearData() {
    return (await getDb()).clear('data');
}

/** Clears all locally stored data and queued writes (e.g. on logout). */
export async function clearAll() {
    const db = await getDb();
    await Promise.all([db.clear('data'), db.clear('outbox')]);
}
