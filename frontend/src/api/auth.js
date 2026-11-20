/** Auth service (backend contract P-01, F-01). The service worker never caches /auth/*. */
import { request } from './client.js';

/** POST /auth/login -> { token, expiresAt, user: { id, email, name } }. 401 INVALID_CREDENTIALS on a wrong email or password. */
export function login({ email, password }, { signal } = {}) {
    return request('/auth/login', { method: 'POST', body: { email, password }, auth: false, signal });
}

/** GET /auth/me -> { user, expiresAt }. A 401 means the stored session has ended. */
export function getMe({ signal } = {}) {
    return request('/auth/me', { cache: 'no-store', signal });
}

/** POST /auth/logout -> 204. Best effort: a 401 means the session was already gone. */
export function logout(token) {
    return request('/auth/logout', { method: 'POST', token, skipUnauthorized: true, trackConnectivity: false });
}
