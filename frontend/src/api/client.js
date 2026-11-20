/**
 * The single fetch wrapper (frontend-architecture.md section 6). Components never call fetch directly.
 *
 * request(path, options) -> { data, status, fromCache, fetchedAt }
 *   fromCache: true when the service worker served a cached copy (network failed or timed out)
 *   fetchedAt: ISO time the data was fetched from the server
 * Throws ApiError { status, offline, body }. `offline: true` means the network was unreachable.
 */
import { API_BASE_URL } from '../config.js';
import { reportNetworkFailure, reportNetworkSuccess } from '../offline/network.js';

export class ApiError extends Error {
    constructor(message, { status = 0, offline = false, body = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.offline = offline;
        this.body = body;
    }
}

async function parseBody(res) {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function request(
    path,
    { method = 'GET', body, headers, cache, signal, idempotencyKey, trackConnectivity = true } = {}
) {
    if (!API_BASE_URL) {
        throw new ApiError('API base URL is not configured (VITE_API_BASE_URL)', { status: 0 });
    }

    const init = {
        method,
        headers: { Accept: 'application/json', ...(headers || {}) },
        signal,
    };
    if (cache) init.cache = cache;
    if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    if (idempotencyKey) init.headers['Idempotency-Key'] = idempotencyKey;

    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, init);
    } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        if (trackConnectivity) reportNetworkFailure();
        throw new ApiError('Network request failed', { offline: true });
    }

    const fromCache = res.headers.get('x-sw-cache') === 'hit';
    if (trackConnectivity) {
        if (fromCache) reportNetworkFailure();
        else reportNetworkSuccess();
    }

    const data = await parseBody(res);
    if (!res.ok) {
        const message = (data && data.message) || `Request failed with status ${res.status}`;
        throw new ApiError(message, { status: res.status, body: data });
    }

    const dateHeader = res.headers.get('date');
    const fetchedAt =
        res.headers.get('x-sw-fetched-at') || (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString());

    return { data, status: res.status, fromCache, fetchedAt };
}
