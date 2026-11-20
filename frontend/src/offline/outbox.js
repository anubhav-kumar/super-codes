/**
 * Offline write outbox (frontend-architecture.md section 8.4). Last-write-wins.
 *
 * Interface:
 *   enqueueWrite({ method, path, body }) -> queued item (id doubles as the Idempotency-Key)
 *   listOutbox()                          -> all queued items, oldest first
 *   replayOutbox()                        -> sends pending items in order
 *   subscribeOutbox(listener)             -> called after any outbox change
 *   startOutboxSync()                     -> replays on start and whenever the device comes online
 *
 * The boilerplate has no writes yet, so nothing enqueues. Features that support offline
 * writes call enqueueWrite() when api/client.js throws an error with `offline: true`.
 */
import { request } from '../api/client.js';
import { getDb } from './db.js';

const listeners = new Set();
let replaying = false;

const notify = () => {
    for (const l of listeners) l();
};

export function subscribeOutbox(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export async function enqueueWrite({ method, path, body }) {
    const item = {
        id: crypto.randomUUID(),
        method,
        path,
        body: body === undefined ? null : body,
        createdAt: new Date().toISOString(),
        status: 'pending',
        error: null,
    };
    await (await getDb()).put('outbox', item);
    notify();
    return item;
}

export async function listOutbox() {
    return (await getDb()).getAllFromIndex('outbox', 'createdAt');
}

export async function replayOutbox() {
    if (replaying) return;
    replaying = true;
    try {
        const db = await getDb();
        const items = (await db.getAllFromIndex('outbox', 'createdAt')).filter((i) => i.status === 'pending');
        for (const item of items) {
            try {
                await request(item.path, { method: item.method, body: item.body ?? undefined, idempotencyKey: item.id });
                await db.delete('outbox', item.id);
            } catch (err) {
                if (err.status >= 400 && err.status < 500) {
                    // Not retried forever: the UI shows "sync failed" with the server error.
                    await db.put('outbox', { ...item, status: 'failed', error: err.message });
                } else {
                    break; // offline or server error: keep order, retry later
                }
            } finally {
                notify();
            }
        }
    } finally {
        replaying = false;
    }
}

export function startOutboxSync() {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return;
    const run = () => replayOutbox().catch(() => {});
    window.addEventListener('online', run);
    run();
}
