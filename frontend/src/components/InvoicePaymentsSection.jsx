import { PAYMENT_STATUS_TONE, paymentStatusLabel } from '../constants/payments.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { formatDate, formatMoney } from '../utils/format.js';
import Badge from './Badge.jsx';
import Button from './Button.jsx';
import ListItem from './ListItem.jsx';
import RelatedSection from './RelatedSection.jsx';

function subtitleOf(p) {
    const parts = [];
    if (p.paymentDate) parts.push(`Paid ${formatDate(p.paymentDate)}`);
    else if (p.expiryDate) parts.push(`Expires ${formatDate(p.expiryDate)}`);
    if (p.link) parts.push(p.link);
    return parts.join(' · ') || undefined;
}

/**
 * "Payments" section on the invoice detail screen (F-07): reference, amount, status and payment
 * date of each payment, each row opening its edit form. Payments come inside the invoice detail
 * response, so this section shares the page's loading and offline state.
 * "Add payment" is enabled only when the invoice's base status is ISSUED (a partially paid or
 * overdue invoice is still ISSUED) and the device is online.
 */
export default function InvoicePaymentsSection({ invoice }) {
    const { online } = useOnlineStatus();
    const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    const issued = invoice.baseStatus === 'ISSUED';

    return (
        <RelatedSection
            title="Payments"
            count={payments.length}
            className="mt-4"
            action={
                <Button size="sm" variant="secondary" icon="plus" to={`/invoices/${invoice.id}/payments/new`} disabled={!online || !issued}>
                    Add payment
                </Button>
            }
            footer={
                !issued && (
                    <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">Issue the invoice to add payments.</p>
                )
            }
        >
            {payments.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-muted">No payments yet. Only Paid payments count as received.</p>
            ) : (
                <ul className="divide-y divide-line border-t border-line">
                    {payments.map((p) => (
                        <li key={p.id}>
                            <ListItem
                                to={`/invoices/${invoice.id}/payments/${p.id}/edit`}
                                title={<span className="tabular-nums">{p.paymentNumber}</span>}
                                subtitle={subtitleOf(p)}
                                meta={formatMoney(p.amount)}
                                badges={<Badge tone={PAYMENT_STATUS_TONE[p.status]}>{paymentStatusLabel(p.status)}</Badge>}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </RelatedSection>
    );
}
