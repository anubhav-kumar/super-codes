/**
 * Auth service (backend contract P-01 F-01, FR1 P-24 F-46). The service worker never caches /auth/*.
 *
 * Session user (login and me): { id, email, name, isAdmin, workerId, workerName, mustChangePassword }
 *   isAdmin             false for members; users from before FR1 come back as true
 *   workerId            linked Worker id, or null
 *   workerName          linked Worker's name, or null (as built; not in the planned contract)
 *   mustChangePassword  true while a temporary password is active: every route except me, password
 *                       and logout then answers 403 PASSWORD_CHANGE_REQUIRED
 */
import { request } from './client.js';

/** POST /auth/login -> { token, expiresAt, user: Session user }. 401 INVALID_CREDENTIALS on a wrong email or password.
 * 401 TEMPORARY_PASSWORD_EXPIRED: right temporary password, issued more than 2 hours ago (F-50). With a valid
 * temporary password the user has mustChangePassword true and expiresAt is the temporary password's expiry. */
export function login({ email, password }, { signal } = {}) {
    return request('/auth/login', { method: 'POST', body: { email, password }, auth: false, signal });
}

/**
 * GET /auth/me -> { user: Session user, expiresAt }, read from the user record on every call, so role,
 * Worker link and name are current. Allowed while a temporary password is active. A 401 means the
 * stored session has ended (signed out, user deleted, password reset, temporary password expired).
 */
export function getMe({ signal } = {}) {
    return request('/auth/me', { cache: 'no-store', signal });
}

/** POST /auth/logout -> 204. Best effort: a 401 means the session was already gone. */
export function logout(token) {
    return request('/auth/logout', { method: 'POST', token, skipUnauthorized: true, trackConnectivity: false });
}

/**
 * POST /auth/password { currentPassword, newPassword } -> { user: Session user, expiresAt } (F-47).
 * This session stays (its expiry is reset); every other session of the user ends.
 * 400 VALIDATION_FAILED with details field "currentPassword" (wrong current password; 400, not 401,
 * so the app stays signed in) or "newPassword" (too short, too long, same as current).
 * Allowed while a temporary password is active (the "Set a new password" screen uses it too).
 */
export function changePassword({ currentPassword, newPassword }) {
    return request('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
}

/**
 * Replace a temporary password (F-50): POST /auth/password with the temporary password as
 * currentPassword -> { user: Session user (mustChangePassword false), expiresAt }.
 * 400 field "currentPassword" (wrong temporary password) or "newPassword" (too short, same as temporary).
 * A 401 comes back to the caller instead of signing out at once (skipUnauthorized), so the screen can
 * say the temporary password expired and offer Sign out.
 */
export function setNewPassword({ temporaryPassword, newPassword }) {
    return request('/auth/password', {
        method: 'POST',
        body: { currentPassword: temporaryPassword, newPassword },
        skipUnauthorized: true,
    });
}
