/**
 * The single fetch wrapper (frontend-architecture.md section 6). Components never call fetch directly.
 *
 * request(path, options) -> { data, status, fromCache, fetchedAt }
 *   fromCache: true when the service worker served a cached copy (network failed or timed out)
 *   fetchedAt: ISO time the data was fetched from the server
 * Throws ApiError { status, code, details, offline, body }. `offline: true` means the network was unreachable.
 *
 * Auth: every request sends `Authorization: Bearer <token>` from the stored session, unless
 * `auth: false` (sign-in, health). A 401 on an authenticated request calls the handler registered
 * with setUnauthorizedHandler (clears the session and returns to the sign-in screen), unless
 * `skipUnauthorized: true` (sign-out).
 */
import { API_BASE_URL } from '../config.js';
import { getToken } from '../auth/session.js';
import { reportNetworkFailure, reportNetworkSuccess } from '../offline/network.js';

export class ApiError extends Error {
    constructor(message, { status = 0, code = null, details = [], offline = false, body = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.offline = offline;
        this.body = body;
    }
}

let unauthorizedHandler = null;

/** Registers the function called on a 401 from an authenticated request. Returns an unregister function. */
export function setUnauthorizedHandler(handler) {
    unauthorizedHandler = handler;
    return () => {
        if (unauthorizedHandler === handler) unauthorizedHandler = null;
    };
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

// Lambda errors: { error: { code, message, details } }. API Gateway errors: { message }.
function toApiError(res, data) {
    const err = data && typeof data === 'object' && data.error && typeof data.error === 'object' ? data.error : null;
    const message =
        (err && err.message) ||
        (data && typeof data === 'object' && data.message) ||
        `Request failed with status ${res.status}`;
    return new ApiError(message, {
        status: res.status,
        code: (err && err.code) || null,
        details: (err && Array.isArray(err.details) && err.details) || [],
        body: data,
    });
}

export async function request(
    path,
    {
        method = 'GET',
        body,
        headers,
        cache,
        signal,
        idempotencyKey,
        trackConnectivity = true,
        auth = true,
        token,
        skipUnauthorized = false,
    } = {}
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
    const bearer = auth ? token || getToken() : null;
    if (bearer) init.headers.Authorization = `Bearer ${bearer}`;

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
        const error = toApiError(res, data);
        if (res.status === 401 && auth && !skipUnauthorized && unauthorizedHandler) unauthorizedHandler(error);
        throw error;
    }

    const dateHeader = res.headers.get('date');
    const fetchedAt =
        res.headers.get('x-sw-fetched-at') || (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString());

    return { data, status: res.status, fromCache, fetchedAt };
}
