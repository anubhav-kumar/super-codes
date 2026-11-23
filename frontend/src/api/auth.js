/**
 * Auth service (backend contract P-01 F-01, FR1 P-24 F-46). The service worker never caches /auth/*.
 *
 * Session user (login and me): { id, email, name, isAdmin, workerId, mustChangePassword }
 *   isAdmin             false for members; users from before FR1 come back as true
 *   workerId            linked Worker id, or null
 *   mustChangePassword  true while a temporary password is active: every route except me, password
 *                       and logout then answers 403 PASSWORD_CHANGE_REQUIRED
 */
import { request } from './client.js';

/** POST /auth/login -> { token, expiresAt, user: Session user }. 401 INVALID_CREDENTIALS on a wrong email or password. */
export function login({ email, password }, { signal } = {}) {
    return request('/auth/login', { method: 'POST', body: { email, password }, auth: false, signal });
}

/**
 * GET /auth/me -> { user: Session user, expiresAt }, read from the user record on every call, so role,
 * Worker link and name are current. Allowed while a temporary password is active. A 401 means the
 * stored session has ended (signed out, user deleted, password reset).
 */
export function getMe({ signal } = {}) {
    return request('/auth/me', { cache: 'no-store', signal });
}

/** POST /auth/logout -> 204. Best effort: a 401 means the session was already gone. */
export function logout(token) {
    return request('/auth/logout', { method: 'POST', token, skipUnauthorized: true, trackConnectivity: false });
}
