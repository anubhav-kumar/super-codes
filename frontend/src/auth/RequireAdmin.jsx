import useRole from '../hooks/useRole.js';
import NotFoundPage from '../pages/NotFoundPage.jsx';

/**
 * Admin-only route content. Members get "Page not found" in place (no redirect, so the URL stays and
 * Back works), matching the backend's 404 for routes outside their rights. Hiding is not security:
 * the backend enforces every rule.
 */
export default function RequireAdmin({ children }) {
    const { isAdmin } = useRole();
    return isAdmin ? children : <NotFoundPage />;
}
