import { useLocation } from 'react-router-dom';
import useRole from '../hooks/useRole.js';
import { activeNavItem, visibleNavItems } from '../navigation.js';
import Button from './Button.jsx';
import Icon from './Icon.jsx';

/**
 * The list a stale link belongs to, from the nav item that covers `pathname`. Clients covers two
 * lists, so the matched prefix decides ("/companies/x" -> Companies). Null when no section or Home.
 * Only sections the user's role may see count, so a member never gets "Go to Users".
 */
function sectionList(pathname, items) {
    const item = activeNavItem(pathname, items);
    if (!item || item.to === '/') return null;
    const prefix = (item.match || [item.to]).find((p) => pathname === p || pathname.startsWith(`${p}/`)) || item.to;
    if (prefix === item.to) return { to: item.to, label: item.label };
    return { to: prefix, label: prefix.charAt(1).toUpperCase() + prefix.slice(2) };
}

/**
 * Plain-language Not found (F-19), for an unknown address and for a missing record alike:
 * icon, title ("Page not found" / "Order not found"), "This link may be old or mistyped.",
 * primary "Go to <section list>" and secondary "Go to Home". Never says "404".
 */
export default function NotFoundState({ title = 'Page not found', className = '' }) {
    const { pathname } = useLocation();
    const { isAdmin } = useRole();
    const list = sectionList(pathname, visibleNavItems({ isAdmin }));
    return (
        <div className={`flex flex-col items-center gap-3 px-4 py-12 text-center md:py-16 ${className}`}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-subtle">
                <Icon name="not-found" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            <p className="max-w-sm text-sm text-ink-muted">This link may be old or mistyped.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                {list ? (
                    <>
                        <Button to={list.to}>Go to {list.label}</Button>
                        <Button variant="secondary" to="/">
                            Go to Home
                        </Button>
                    </>
                ) : (
                    <Button to="/">Go to Home</Button>
                )}
            </div>
        </div>
    );
}
