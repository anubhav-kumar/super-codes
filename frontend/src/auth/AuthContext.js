import { createContext } from 'react';

/**
 * { user, session, signIn({ email, password }), signOut(), refreshMe(), updateSession(patch) }.
 * Provided by AuthProvider. user = { id, email, name, isAdmin, workerId, workerName, mustChangePassword };
 * screens read the role through hooks/useRole.js. refreshMe() re-reads GET /auth/me and resolves with
 * the new session (rejects offline); updateSession({ user?, token?, expiresAt? }) merges into the session.
 */
export const AuthContext = createContext(null);
