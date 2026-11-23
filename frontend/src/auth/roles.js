/**
 * Role helpers for the session user (FR1 decisions 1, 2, 4). Screens ask through useRole(), not here.
 * Session user shape: { id, email, name, isAdmin, workerId, mustChangePassword }.
 */

/** Admin unless the server says otherwise: a missing isAdmin (users and sessions from before FR1) means admin. */
export const isAdminUser = (user) => Boolean(user) && user.isAdmin !== false;

/** Linked Worker id, or null. */
export const userWorkerId = (user) => (user && user.workerId) || null;

/** Changes whenever the user, their role or their Worker link changes; cached data is only valid for one key. */
export const scopeKey = (user) =>
    user ? `${user.id}|${isAdminUser(user) ? 'admin' : 'member'}|${userWorkerId(user) || ''}` : '';
