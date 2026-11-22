import { PAYMENT_STATUS_TONE, paymentStatusLabel } from '../constants/payments.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { formatDate, formatMoney } from '../utils/format.js';
import Badge from './Badge.jsx';
import ListRow from './ListRow.jsx';
import Money from './Money.jsx';
import RecordNo from './RecordNo.jsx';
import Section from './Section.jsx';
import SectionAction from './SectionAction.jsx';

/** The date that matters for a payment: when it was paid, else when a request expires or was created. */
function dateOf(p) {
    if (p.status === 'PAID' && p.paymentDate) return `Paid ${formatDate(p.paymentDate)}`;
    if (p.paymentDate) return formatDate(p.paymentDate);
    if (p.expiryDate) return `Expires ${formatDate(p.expiryDate)}`;
    if (p.createdDate) return `Created ${formatDate(p.createdDate)}`;
    return null;
}

/**
 * A payment as a two-line row. Line 1: kind and amount (bold when Paid, since only Paid counts as
 * received; gray otherwise). Line 2: PAY number · status badge · date · reference.
 */
function PaymentRow({ invoiceId, payment: p }) {
    const counted = p.status === 'PAID';
    const reference = p.transactionReference || p.link;
    const date = dateOf(p);
    return (
        <ListRow
            to={`/invoices/${invoiceId}/payments/${p.id}/edit`}
            title={counted ? 'Payment received' : 'Payment request'}
            trailing={
                counted ? (
                    <Money value={p.amount} strong />
                ) : (
                    <span className="whitespace-nowrap text-ink-muted tabular-nums">{formatMoney(p.amount, { paise: 'none' })}</span>
                )
            }
            meta={[
                <RecordNo key="no">{p.paymentNumber}</RecordNo>,
                <Badge key="status" tone={PAYMENT_STATUS_TONE[p.status]}>
                    {paymentStatusLabel(p.status)}
                </Badge>,
                date && <span key="date">{date}</span>,
                reference && (
                    <span key="ref" className="break-all">
                        {reference}
                    </span>
                ),
            ]}
        />
    );
}

/**
 * "Payments" section on the invoice detail screen (F-07, restyled in F-26): one row per payment,
 * each opening its edit form. Payments come inside the invoice detail response, so this section
 * shares the page's loading and offline state. The section action "Record payment" shows only on an
 * issued invoice (base status ISSUED, which includes partly paid and overdue) and is disabled offline.
 */
export default function InvoicePaymentsSection({ invoice, className = 'mt-4' }) {
    const { online } = useOnlineStatus();
    const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    const issued = invoice.baseStatus === 'ISSUED';

    let note = null;
    if (invoice.baseStatus === 'DRAFT') note = 'Issue the invoice to record payments.';
    else if (invoice.baseStatus === 'CANCELLED') note = 'Cancelled invoices take no new payments.';
    else if (payments.some((p) => p.status !== 'PAID')) note = 'Only Paid payments count as received.';

    return (
        <Section
            title="Payments"
            count={payments.length}
            className={className}
            action={
                issued ? (
                    <SectionAction icon="payment" to={`/invoices/${invoice.id}/payments/new`} disabled={!online}>
                        Record payment
                    </SectionAction>
                ) : null
            }
            footer={note ? <p className="px-4 py-3 text-sm text-ink-muted">{note}</p> : null}
        >
            {payments.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-muted">No payments yet.</p>
            ) : (
                <ul className="divide-y divide-line border-t border-line">
                    {payments.map((p) => (
                        <li key={p.id}>
                            <PaymentRow invoiceId={invoice.id} payment={p} />
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}
