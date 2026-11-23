import KeyFigures from '../KeyFigures.jsx';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const OPEN_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'];

/** Open orders: the summary's openCount when sent, else the sum of the open statuses in byStatus. */
export function openOrderCount(orders) {
    if (!orders) return 0;
    if (orders.openCount !== undefined && orders.openCount !== null) return num(orders.openCount);
    const byStatus = orders.byStatus || {};
    return OPEN_STATUSES.reduce((sum, s) => sum + num(byStatus[s]), 0);
}

/**
 * The four figures on a member's Home (P-26 F-58), over their own orders only, each opening the
 * matching filtered Orders list:
 *   Open orders    -> /orders
 *   Overdue        -> /orders?filter=overdue        (danger above 0)
 *   Due this week  -> /orders?filter=due-week       (warning above 0)
 *   In progress    -> /orders?status=IN_PROGRESS
 * No money: firm revenue figures are admin only.
 */
export default function MemberFigures({ orders, className = '' }) {
    const o = orders || {};
    const open = openOrderCount(o);
    const overdue = num(o.overdueCount);
    const dueSoon = num(o.dueSoonCount);
    const inProgress = num(o.byStatus && o.byStatus.IN_PROGRESS);

    const items = [
        { key: 'open', label: 'Open orders', value: open, sub: 'Assigned to you', to: '/orders' },
        {
            key: 'overdue',
            label: 'Overdue',
            value: overdue,
            sub: overdue === 0 ? 'All on time' : 'Past due date',
            tone: 'danger',
            number: overdue,
            to: '/orders?filter=overdue',
        },
        {
            key: 'due-week',
            label: 'Due this week',
            value: dueSoon,
            sub: 'Next 7 days',
            tone: 'warning',
            number: dueSoon,
            to: '/orders?filter=due-week',
        },
        { key: 'in-progress', label: 'In progress', value: inProgress, sub: 'Being worked on', to: '/orders?status=IN_PROGRESS' },
    ];

    return <KeyFigures items={items} className={className} />;
}
