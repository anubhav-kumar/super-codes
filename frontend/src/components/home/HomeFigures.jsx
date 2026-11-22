import { formatMoney } from '../../utils/format.js';
import KeyFigures from '../KeyFigures.jsx';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * The four firm figures on Home (F-20), each opening the matching filtered list:
 *   Outstanding (₹ + unpaid count)  -> /invoices?filter=unpaid
 *   Overdue invoices (₹ + count)    -> /invoices?filter=overdue   (danger above 0)
 *   Orders overdue (count)          -> /orders?filter=overdue     (danger above 0)
 *   Due this week (count)           -> /orders?filter=due-week    (warning above 0)
 * Phones: 2 x 2; md+: one row of 4 (KeyFigures).
 */
export default function HomeFigures({ summary, className = '' }) {
    const invoices = (summary && summary.invoices) || {};
    const orders = (summary && summary.orders) || {};
    const unpaid = num(invoices.unpaidCount);
    const overdueInvoices = num(invoices.overdueCount);
    const overdueOrders = num(orders.overdueCount);
    const dueSoon = num(orders.dueSoonCount);

    const items = [
        {
            key: 'outstanding',
            label: 'Outstanding',
            value: formatMoney(num(invoices.outstandingTotal), { paise: 'auto' }),
            sub: unpaid === 0 ? 'No unpaid invoices' : plural(unpaid, 'unpaid invoice'),
            to: '/invoices?filter=unpaid',
        },
        {
            key: 'overdue-invoices',
            label: 'Overdue invoices',
            value: formatMoney(num(invoices.overdueTotal), { paise: 'auto' }),
            sub: plural(overdueInvoices, 'invoice'),
            tone: 'danger',
            number: overdueInvoices,
            to: '/invoices?filter=overdue',
        },
        {
            key: 'overdue-orders',
            label: 'Orders overdue',
            value: overdueOrders,
            sub: overdueOrders === 0 ? 'All on time' : 'Past due date',
            tone: 'danger',
            number: overdueOrders,
            to: '/orders?filter=overdue',
        },
        {
            key: 'due-week',
            label: 'Due this week',
            value: dueSoon,
            sub: 'Orders, next 7 days',
            tone: 'warning',
            number: dueSoon,
            to: '/orders?filter=due-week',
        },
    ];

    return <KeyFigures items={items} className={className} />;
}
