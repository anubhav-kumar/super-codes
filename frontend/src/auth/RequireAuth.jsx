import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';

/** Checks the local session only (no API call), so a signed-in user can open the app offline. */
export default function RequireAuth({ children }) {
    const { session } = useAuth();
    const location = useLocation();
    if (!session) {
        const next = `${location.pathname}${location.search}`;
        return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
    }
    return children;
}
