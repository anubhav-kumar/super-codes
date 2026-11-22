import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import useSidebarState from '../hooks/useSidebarState.js';
import { activeNavItem, sortedNavItems } from '../navigation.js';
import AccountMenu from './AccountMenu.jsx';
import AppMark from './AppMark.jsx';
import Icon from './Icon.jsx';
import PageBody from './PageBody.jsx';
import PageSkeleton from './PageSkeleton.jsx';
import ShellHeaderContext from './ShellHeaderContext.js';
import Tooltip from './Tooltip.jsx';

export { ShellHeaderContext };

const SIDEBAR_NAV_ID = 'sidebar-nav';
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const ACTIVE_BAR = 'before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent';

function SidebarItem({ item, active, collapsed }) {
    const shape = collapsed ? 'h-10 w-10 justify-center' : 'h-10 w-full gap-3 px-3';
    const tone = active
        ? `bg-surface-muted font-semibold text-ink ${ACTIVE_BAR}`
        : 'font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink';
    return (
        <Tooltip label={item.label} side="right" disabled={!collapsed} describe={false} className="flex">
            <NavLink
                to={item.to}
                end={item.to === '/'}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={`relative flex items-center rounded-control text-sm whitespace-nowrap transition-colors ${shape} ${tone} ${FOCUS_RING}`}
            >
                <Icon name={item.icon} />
                {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
        </Tooltip>
    );
}

function Sidebar({ items, activeId, collapsed, onToggle }) {
    const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    return (
        <aside
            className={`hidden shrink-0 flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-150 ease-out motion-reduce:transition-none md:flex ${collapsed ? 'w-16' : 'w-60'}`}
        >
            <div className={`flex h-14 shrink-0 items-center ${collapsed ? 'justify-center' : 'px-4'}`}>
                <AppMark size={32} withWordmark={!collapsed} />
            </div>
            <nav
                id={SIDEBAR_NAV_ID}
                aria-label="Main"
                className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2 ${collapsed ? 'items-center px-3' : 'px-3'}`}
            >
                {items.map((item) => (
                    <SidebarItem key={item.id} item={item} active={activeId === item.id} collapsed={collapsed} />
                ))}
            </nav>
            <div className={`flex shrink-0 border-t border-line p-3 ${collapsed ? 'justify-center' : ''}`}>
                {/* Same element in both states, so focus stays on the toggle after it changes. */}
                <Tooltip label={toggleLabel} side="right" disabled={!collapsed} describe={false} className="flex w-full justify-center">
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={!collapsed}
                        aria-controls={SIDEBAR_NAV_ID}
                        aria-label={collapsed ? toggleLabel : undefined}
                        className={`flex h-10 items-center rounded-control text-sm font-medium whitespace-nowrap text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink ${FOCUS_RING} ${collapsed ? 'w-10 justify-center' : 'w-full gap-3 px-3'}`}
                    >
                        <Icon name={collapsed ? 'sidebar-expand' : 'sidebar-collapse'} />
                        {!collapsed && <span>{toggleLabel}</span>}
                    </button>
                </Tooltip>
            </div>
        </aside>
    );
}

function BottomNav({ items, activeId }) {
    return (
        <nav aria-label="Main" className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
            {items.map((item) => {
                const active = activeId === item.id;
                return (
                    <NavLink
                        key={item.id}
                        to={item.to}
                        end={item.to === '/'}
                        aria-current={active ? 'page' : undefined}
                        className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] leading-4 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${active ? 'font-semibold text-ink' : 'font-medium text-ink-subtle hover:text-ink'}`}
                    >
                        <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? 'bg-surface-muted' : ''}`}>
                            <Icon name={item.icon} />
                        </span>
                        <span className="max-w-full truncate px-1">{item.label}</span>
                    </NavLink>
                );
            })}
        </nav>
    );
}

/**
 * Layout for signed-in screens. md+: collapsible left sidebar (240 px or a 64 px icon rail,
 * remembered per browser). Phones: bottom navigation. Both are built from NAV_ITEMS.
 * The 56 px top bar holds a slot that the page fills through PageHeader (title or back button,
 * search, actions) followed by the account menu. Content has no max width; pages set it with PageBody.
 */
export default function AppShell() {
    const location = useLocation();
    const items = sortedNavItems();
    const active = activeNavItem(location.pathname);
    const { collapsed, toggle } = useSidebarState();
    const [slot, setSlot] = useState(null);

    return (
        <ShellHeaderContext.Provider value={slot}>
            <div className="flex h-full min-h-0">
                <Sidebar items={items} activeId={active?.id} collapsed={collapsed} onToggle={toggle} />

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 sm:px-4 md:px-6">
                        <div ref={setSlot} className="flex h-full min-w-0 flex-1 items-center" />
                        <AccountMenu />
                    </header>

                    <main className="min-h-0 flex-1 overflow-y-auto">
                        <Suspense
                            fallback={
                                <PageBody>
                                    <PageSkeleton variant="list" />
                                </PageBody>
                            }
                        >
                            <Outlet />
                        </Suspense>
                    </main>

                    <BottomNav items={items} activeId={active?.id} />
                </div>
            </div>
        </ShellHeaderContext.Provider>
    );
}
