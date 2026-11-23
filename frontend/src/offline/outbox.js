/**
 * Offline write outbox (frontend-architecture.md section 8.4). Last-write-wins.
 *
 * Interface:
 *   enqueueWrite({ method, path, body }) -> queued item (id doubles as the Idempotency-Key),
 *                                           stamped with the signed-in user's id; throws without a session
 *   listOutbox()                          -> all queued items, oldest first
 *   replayOutbox()                        -> sends the signed-in user's pending items in order
 *   stopOutboxReplay()                    -> stops a running replay; resolves when it has ended
 *   subscribeOutbox(listener)             -> called after any outbox change
 *   startOutboxSync()                     -> replays on start and whenever the device comes online
 *
 * One user's queued writes are never sent with another user's token: replay reads the session once,
 * sends that token explicitly, replays only items stamped with that user's id, drops items of any
 * other user (or unstamped ones), and stops as soon as the session user changes.
 *
 * No feature enqueues yet. Features that support offline writes call enqueueWrite() when
 * api/client.js throws an error with `offline: true`.
 */
import { request } from '../api/client.js';
import { readSession } from '../auth/session.js';
import { getDb } from './db.js';

const listeners = new Set();
let running = null; // promise of the replay in progress
let stopRequested = false;

const notify = () => {
    for (const l of listeners) l();
};

const sessionUserId = () => readSession()?.user?.id || null;

export function subscribeOutbox(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export async function enqueueWrite({ method, path, body }) {
    const userId = sessionUserId();
    if (!userId) throw new Error('Cannot queue a write without a signed-in user');
    const item = {
        id: crypto.randomUUID(),
        userId,
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

async function replay() {
    const session = readSession();
    if (!session || !session.user || !session.user.id) return;
    const { token } = session;
    const userId = session.user.id;
    const db = await getDb();
    const items = await db.getAllFromIndex('outbox', 'createdAt');
    for (const item of items) {
        if (stopRequested || sessionUserId() !== userId) break;
        if (item.userId !== userId) {
            await db.delete('outbox', item.id);
            notify();
            continue;
        }
        if (item.status !== 'pending') continue;
        try {
            await request(item.path, {
                method: item.method,
                body: item.body ?? undefined,
                idempotencyKey: item.id,
                token,
                skipUnauthorized: true,
            });
            await db.delete('outbox', item.id);
        } catch (err) {
            if (err.status === 401) break; // session ended: keep the item; sign-out clears the outbox
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
}

export function replayOutbox() {
    if (running) return running;
    stopRequested = false;
    running = replay().finally(() => {
        running = null;
    });
    return running;
}

export async function stopOutboxReplay() {
    if (!running) return;
    stopRequested = true;
    await running.catch(() => {});
}

export function startOutboxSync() {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return;
    const run = () => replayOutbox().catch(() => {});
    window.addEventListener('online', run);
    run();
}
