import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';

const SET_PASSWORD_PATH = '/set-password';

/**
 * Checks the local session only (no API call), so a signed-in user can open the app offline.
 * A session that still has to replace a temporary password goes to "Set a new password" first.
 */
export default function RequireAuth({ children }) {
    const { session } = useAuth();
    const location = useLocation();
    const next = `${location.pathname}${location.search}`;
    if (!session) {
        return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
    }
    if (session.user && session.user.mustChangePassword === true && location.pathname !== SET_PASSWORD_PATH) {
        return <Navigate to={`${SET_PASSWORD_PATH}?next=${encodeURIComponent(next)}`} replace />;
    }
    return children;
}
