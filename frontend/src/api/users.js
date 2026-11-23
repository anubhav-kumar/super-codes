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
