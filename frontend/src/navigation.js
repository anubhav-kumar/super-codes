/**
 * Top-level navigation (bottom nav on phones, sidebar on md+), sorted by `order`.
 * One line per item, under the marker of the pipeline that adds it; keep the blank line after
 * each marker. Optional: description and quickAction: { label, to } (shown on Home).
 * icon is an Icon name; match lists the path prefixes that keep the item highlighted.
 */
export const NAV_ITEMS = [
    // P-01 Sign in
    { id: 'home', label: 'Home', to: '/', match: ['/'], icon: 'home', order: 10 },

    // P-02 Client directory

    // P-03 Workers
    { id: 'workers', label: 'Workers', to: '/workers', match: ['/workers'], icon: 'workers', order: 50, description: "The firm's team: who can be assigned to orders.", quickAction: { label: 'Add worker', to: '/workers/new' } },

    // P-04 Orders

    // P-05 Invoices and payments

];

export const sortedNavItems = () => [...NAV_ITEMS].sort((a, b) => a.order - b.order);

/** The nav item whose `match` prefixes cover `pathname` ("/" matches only itself). */
export function activeNavItem(pathname) {
    let best = null;
    let bestLen = -1;
    for (const item of NAV_ITEMS) {
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
