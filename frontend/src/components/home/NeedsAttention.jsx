import { Link } from 'react-router-dom';
import { isOrderOverdue } from '../../utils/due.js';
import Icon from '../Icon.jsx';
import InvoiceRow from '../InvoiceRow.jsx';
import OrderRow from '../OrderRow.jsx';
import Section from '../Section.jsx';

const MAX_ITEMS = 8;
const days = (item) => (Number.isFinite(Number(item.daysOverdue)) ? Number(item.daysOverdue) : 0);

// Summary items -> the shapes InvoiceRow / OrderRow read.
const toInvoice = (i) => ({
    ...i,
    baseStatus: 'ISSUED',
    isOverdue: true,
    displayedStatus: i.displayedStatus || 'OVERDUE',
});
const toOrder = (o) => ({ ...o, status: o.status || 'IN_PROGRESS' });

/**
 * Most urgent overdue invoices and orders, mixed: most days overdue first, then earliest due date
 * (invoices before orders on a tie). Up to 8 rows.
 */
function urgentItems(summary) {
    const invoices = (summary.overdueInvoices || []).map((i) => ({ kind: 'invoice', id: i.id, days: days(i), dueDate: i.dueDate || '', record: toInvoice(i) }));
    const orders = (summary.overdueOrders || [])
        .map(toOrder)
        .filter((o) => isOrderOverdue(o))
        .map((o) => ({ kind: 'order', id: o.id, days: days(o), dueDate: o.dueDate || '', record: o }));
    return [...invoices, ...orders]
        .sort((a, b) => b.days - a.days || (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) || (a.kind === b.kind ? 0 : a.kind === 'invoice' ? -1 : 1))
        .slice(0, MAX_ITEMS);
}

function FooterLink({ to, children }) {
    return (
        <Link
            to={to}
            className="flex min-h-11 items-center justify-between gap-2 px-4 text-sm font-medium text-ink hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
            {children}
            <Icon name="chevron-right" size="sm" className="text-ink-subtle" />
        </Link>
    );
}

/** "Needs attention" on Home (F-20): overdue invoices as InvoiceRow, overdue orders as OrderRow. */
export default function NeedsAttention({ summary, className = '' }) {
    const items = urgentItems(summary || {});
    const invoiceCount = Number((summary && summary.invoices && summary.invoices.overdueCount) || 0);
    const orderCount = Number((summary && summary.orders && summary.orders.overdueCount) || 0);
    const shownInvoices = items.filter((i) => i.kind === 'invoice').length;
    const shownOrders = items.filter((i) => i.kind === 'order').length;
    const moreInvoices = invoiceCount > shownInvoices;
    const moreOrders = orderCount > shownOrders;

    const footer =
        moreInvoices || moreOrders ? (
            <div className="divide-y divide-line">
                {moreInvoices && <FooterLink to="/invoices?filter=overdue">All overdue invoices ({invoiceCount})</FooterLink>}
                {moreOrders && <FooterLink to="/orders?filter=overdue">All overdue orders ({orderCount})</FooterLink>}
            </div>
        ) : undefined;

    return (
        <Section title="Needs attention" footer={footer} className={className}>
            {items.length === 0 ? (
                <p className="flex items-center gap-2 border-t border-line px-4 py-5 text-sm text-ink-muted">
                    <Icon name="success" size="md" className="shrink-0 text-success" />
                    Nothing overdue.
                </p>
            ) : (
                <ul className="divide-y divide-line border-t border-line">
                    {items.map((item) => (
                        <li key={`${item.kind}:${item.id}`}>
                            {item.kind === 'invoice' ? <InvoiceRow invoice={item.record} /> : <OrderRow order={item.record} />}
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}
