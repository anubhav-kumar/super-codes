import { isAdminUser, userWorkerId } from '../auth/roles.js';
import useAuth from './useAuth.js';

/**
 * The only way screens ask about the signed-in user's role.
 *   useRole() -> { user, isAdmin, isMember, workerId, hasWorker }
 * isAdmin is true when the session has no role yet (FR1 decision 2).
 */
export default function useRole() {
    const { user } = useAuth();
    const isAdmin = isAdminUser(user);
    const workerId = userWorkerId(user);
    return { user, isAdmin, isMember: Boolean(user) && !isAdmin, workerId, hasWorker: Boolean(workerId) };
}
