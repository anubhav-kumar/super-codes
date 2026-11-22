import { formatFigure } from '../../utils/format.js';
import KeyFigures from '../KeyFigures.jsx';
import { profileFigures, scrollToSection } from './profileFigures.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Value of a figure: the number once loaded, "…" while loading, "—" when it cannot be loaded. */
function show(value, resource, format) {
    if (value !== null) return format(value);
    return resource.status === 'loading' ? '…' : '—';
}

/**
 * Outstanding, Overdue and Open orders of a client profile. Each tile jumps to its section
 * (#invoices, #orders). Outstanding is neutral unless an invoice is overdue; Overdue is red above 0.
 * `orders` / `invoices` are the useClientOrders / useBillingEntityInvoices results of the page.
 */
export default function ProfileKeyFigures({ orders, invoices, className = '' }) {
    const ordersData = orders.status === 'loaded' ? orders.data : null;
    const invoicesData = invoices.status === 'loaded' ? invoices.data.items : null;
    const f = profileFigures(ordersData, invoicesData);
    const money = formatFigure;
    const anyOverdue = (f.overdueCount || 0) > 0;

    return (
        <KeyFigures
            className={className}
            items={[
                {
                    key: 'outstanding',
                    label: 'Outstanding',
                    value: show(f.outstanding, invoices, money),
                    tone: anyOverdue ? 'danger' : undefined,
                    number: f.outstanding,
                    onClick: () => scrollToSection('invoices'),
                },
                {
                    key: 'overdue',
                    label: 'Overdue',
                    value: show(f.overdueAmount, invoices, money),
                    sub: anyOverdue ? plural(f.overdueCount, 'invoice') : undefined,
                    tone: 'danger',
                    number: f.overdueAmount,
                    onClick: () => scrollToSection('invoices'),
                },
                {
                    key: 'orders',
                    label: 'Open orders',
                    value: show(f.openOrders, orders, String),
                    sub: f.overdueOrders ? `${f.overdueOrders} overdue` : undefined,
                    onClick: () => scrollToSection('orders'),
                },
            ]}
        />
    );
}
