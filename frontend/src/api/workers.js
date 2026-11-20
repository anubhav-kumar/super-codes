/** Workers service (backend contract P-03, F-04). */
import { request } from './client.js';

const enc = encodeURIComponent;

/**
 * GET /workers (all pages) -> { data: Worker[], fromCache, fetchedAt }, sorted by name A-Z (server order).
 * Loads every page so the list screen can filter by status and search on the device.
 * The first page URL has no query string, so the service worker cache key stays stable.
 */
export async function listWorkers({ signal } = {}) {
    const items = [];
    let nextToken = null;
    let fromCache = false;
    let fetchedAt = null;
    do {
        const path = nextToken ? `/workers?nextToken=${enc(nextToken)}` : '/workers';
        const res = await request(path, { signal });
        const page = res.data || {};
        items.push(...(Array.isArray(page.items) ? page.items : []));
        nextToken = page.nextToken || null;
        fromCache = fromCache || res.fromCache;
        if (!fetchedAt || res.fetchedAt < fetchedAt) fetchedAt = res.fetchedAt;
    } while (nextToken);
    return { data: items, fromCache, fetchedAt };
}

/** GET /workers/{id} -> Worker. 404 NOT_FOUND when it does not exist. */
export function getWorker(id, { signal } = {}) {
    return request(`/workers/${enc(id)}`, { signal });
}

/** POST /workers with a client-generated UUID in body.id -> 201 (or 200 if that id already exists). */
export function createWorker(body) {
    return request('/workers', { method: 'POST', body });
}

/** PUT /workers/{id} with the full editable field set (status required) -> 200 Worker. */
export function updateWorker(id, body) {
    return request(`/workers/${enc(id)}`, { method: 'PUT', body });
}
