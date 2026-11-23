/**
 * Top-level navigation (bottom nav on phones, sidebar on md+), sorted by `order`.
 * One line per item, under the marker of the pipeline that adds it; keep the blank line after
 * each marker. Optional: description and quickAction: { label, to } (shown on Home),
 * adminOnly: true (hidden for members), bottomNav: false (md+ sidebar only, not the phone bottom nav).
 * icon is an Icon name; match lists the path prefixes that keep the item highlighted.
 * Screens use visibleNavItems({ isAdmin }), never NAV_ITEMS directly.
 */
export const NAV_ITEMS = [
    // P-01 Sign in
    { id: 'home', label: 'Home', to: '/', match: ['/'], icon: 'home', order: 10 },

    // P-02 Client directory
    { id: 'clients', label: 'Clients', to: '/people', match: ['/people', '/companies'], icon: 'clients', order: 20, description: 'People and companies the firm works with.', quickAction: { label: 'Add person', to: '/people/new' } },

    // P-03 Workers
    { id: 'workers', label: 'Workers', to: '/workers', match: ['/workers'], icon: 'workers', order: 50, description: "The firm's team: who can be assigned to orders.", quickAction: { label: 'Add worker', to: '/workers/new' } },

    // P-04 Orders
    { id: 'orders', label: 'Orders', to: '/orders', match: ['/orders'], icon: 'orders', order: 30, description: 'Work clients ask for, who owns it and where it stands.', quickAction: { label: 'New order', to: '/orders/new' } },

    // P-05 Invoices and payments
    { id: 'invoices', label: 'Invoices', to: '/invoices', match: ['/invoices'], icon: 'invoices', order: 40, description: 'What the firm has billed, to whom and its status.', quickAction: { label: 'New invoice', to: '/invoices/new' } },

];

export const sortedNavItems = () => [...NAV_ITEMS].sort((a, b) => a.order - b.order);

/** Items the user may see, sorted: admin-only items are dropped for members. */
export const visibleNavItems = ({ isAdmin }) => sortedNavItems().filter((item) => isAdmin || !item.adminOnly);

/** The phone bottom nav: visible items without bottomNav: false. */
export const bottomNavItems = (items) => items.filter((item) => item.bottomNav !== false);

/** The nav item among `items` whose `match` prefixes cover `pathname` ("/" matches only itself). */
export function activeNavItem(pathname, items = NAV_ITEMS) {
    let best = null;
    let bestLen = -1;
    for (const item of items) {
        for (const prefix of item.match || [item.to]) {
            const hit = prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`);
            if (hit && prefix.length > bestLen) {
                best = item;
                bestLen = prefix.length;
            }
        }
    }
    return best;
}
