/** User management (backend contract P-25, auth service; admin only, a member gets 404 NOT_FOUND). */
import { ApiError, request } from './client.js';

/**
 * User object:
 *   { id, email, name, isAdmin, worker: { id, name | null, status | null } | null,
 *     status: 'ACTIVE' | 'MUST_SET_PASSWORD' | 'TEMP_PASSWORD_EXPIRED',
 *     temporaryPasswordExpiresAt: ISO | null, createdAt, updatedAt }
 * The service worker sends every /auth/* request NetworkOnly, so user data never enters the API cache.
 */

/** GET /auth/users -> data = User[] (all users, unpaginated, sorted by name then email). */
export async function listUsers({ signal } = {}) {
    const res = await request('/auth/users', { signal });
    const items = (res.data && Array.isArray(res.data.items) && res.data.items) || [];
    return { ...res, data: items };
}

/**
 * One user by id. There is no GET /auth/users/{id} (coder brief, reconciliation 4): the user is
 * taken from the list. Throws a 404 ApiError when the id is not in it.
 */
export async function getUser(id, { signal } = {}) {
    const res = await listUsers({ signal });
    const user = res.data.find((u) => u.id === id);
    if (!user) throw new ApiError('User not found', { status: 404, code: 'NOT_FOUND' });
    return { ...res, data: user };
}

/**
 * POST /auth/users (F-49) with a client-generated UUID v4 in body.id (becomes the user id).
 *   body { id, name, email, isAdmin, workerId: uuid | null }
 * 201 -> data { user, temporaryPassword, temporaryPasswordExpiresAt }: the only time the password is sent.
 * 200 -> same shape with temporaryPassword null: a user with this id already exists (retry).
 * Errors: 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND (workerId), 409 EMAIL_TAKEN (email),
 * 409 WORKER_INACTIVE / WORKER_ALREADY_LINKED (workerId).
 */
export function createUser(body) {
    return request('/auth/users', { method: 'POST', body });
}

/**
 * POST /auth/users/{id}/reset-password (F-51), no body. Not idempotent: each call issues a new password.
 * 200 -> data { user (status MUST_SET_PASSWORD), temporaryPassword, temporaryPasswordExpiresAt }.
 * The user's sessions all end. Errors: 404 NOT_FOUND (unknown id), 409 CANNOT_RESET_SELF.
 */
export function resetUserPassword(id) {
    return request(`/auth/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST' });
}

/**
 * PUT /auth/users/{id} (F-52): the full editable set; workerId null unlinks.
 *   body { name, email, isAdmin, workerId: uuid | null }
 * 200 -> data { user }. Password, status and sessions are untouched; changes apply on the user's next request.
 * Errors: 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND (workerId), 404 NOT_FOUND, 409 EMAIL_TAKEN (email),
 * 409 WORKER_ALREADY_LINKED / WORKER_INACTIVE (workerId), 409 CANNOT_DEMOTE_SELF, 409 LAST_ADMIN.
 */
export function updateUser(id, body) {
    return request(`/auth/users/${encodeURIComponent(id)}`, { method: 'PUT', body });
}
