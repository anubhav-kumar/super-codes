import { Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../config.js';
import { activeNavItem, sortedNavItems } from '../navigation.js';
import AccountMenu from './AccountMenu.jsx';
import AppMark from './AppMark.jsx';
import Icon from './Icon.jsx';
import PageLoader from './PageLoader.jsx';

function NavItemLink({ item, active, layout }) {
    const base =
        layout === 'sidebar'
            ? 'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition'
            : 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition';
    const tone =
        layout === 'sidebar'
            ? active
                ? 'bg-surface-muted text-ink'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            : active
              ? 'text-ink'
              : 'text-ink-muted hover:text-ink';
    return (
        <NavLink to={item.to} end={item.to === '/'} aria-current={active ? 'page' : undefined} className={`${base} ${tone}`}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
        </NavLink>
    );
}

/**
 * Layout for signed-in screens: header (title, back arrow on inner screens, account menu),
 * bottom navigation on phones and a left sidebar on md+, built from NAV_ITEMS.
 */
export default function AppShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const items = sortedNavItems();
    const active = activeNavItem(location.pathname);
    const isTopLevel = items.some((item) => item.to === location.pathname);

    const goBack = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
            return;
        }
        const parent = location.pathname.replace(/\/[^/]+\/?$/, '') || '/';
        navigate(parent, { replace: true });
    };

    return (
        <div className="flex h-full min-h-0">
            <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
                <div className="flex h-14 items-center px-5">
                    <AppMark size={32} withWordmark />
                </div>
                <nav aria-label="Main" className="flex flex-col gap-1 px-3 py-2">
                    {items.map((item) => (
                        <NavItemLink key={item.id} item={item} active={active?.id === item.id} layout="sidebar" />
                    ))}
                </nav>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 sm:px-4">
                    {!isTopLevel ? (
                        <button
                            type="button"
                            onClick={goBack}
                            aria-label="Back"
                            className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
                        >
                            <Icon name="back" />
                        </button>
                    ) : (
                        <span className="w-2" />
                    )}
                    {active?.id === 'home' && isTopLevel && <AppMark size={24} className="mr-2 md:hidden" />}
                    <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
                        <span className="md:hidden">{active && active.id !== 'home' ? active.label : APP_NAME}</span>
                        <span className="hidden md:inline">{active ? active.label : ''}</span>
                    </p>
                    <AccountMenu />
                </header>

                <main className="min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
                        <Suspense fallback={<PageLoader />}>
                            <Outlet />
                        </Suspense>
                    </div>
                </main>

                <nav
                    aria-label="Main"
                    className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
                >
                    {items.map((item) => (
                        <NavItemLink key={item.id} item={item} active={active?.id === item.id} layout="bottom" />
                    ))}
                </nav>
            </div>
        </div>
    );
}
