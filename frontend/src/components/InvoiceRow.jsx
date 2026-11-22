import { INVOICE_STATUS_TONE, invoiceStatusLabel } from '../constants/invoices.js';
import { isInvoiceOpen } from '../utils/due.js';
import { formatMoney } from '../utils/format.js';
import Badge from './Badge.jsx';
import ClientIcon from './ClientIcon.jsx';
import DueLabel from './DueLabel.jsx';
import ListRow from './ListRow.jsx';
import Money from './Money.jsx';
import RecordNo from './RecordNo.jsx';

const ALL = ['billedTo', 'number', 'due'];

/** Right side of line 1: what is still owed. Draft and cancelled show the total, quietly. */
function Amount({ invoice }) {
    if (invoice.baseStatus === 'DRAFT' || invoice.baseStatus === 'CANCELLED') {
        return <span className="whitespace-nowrap text-ink-muted tabular-nums">{formatMoney(invoice.total, { paise: 'none' })}</span>;
    }
    return <Money value={invoice.outstanding ?? 0} overdue={Boolean(invoice.isOverdue)} strong paidLabel />;
}

/**
 * An invoice as a two-line row.
 *   line 1: billed-to (ClientIcon + name, wraps) and the outstanding amount on the right
 *           (red only when overdue, "Paid" when nothing is owed, the total in gray for Draft / Cancelled)
 *   line 2: INV number · DueLabel · one status badge (the due label carries "Overdue")
 * `show` picks the parts (a profile omits 'billedTo'; the number then becomes the title).
 * `hideStatus` drops the badge. `extra` adds nodes to line 2. `to` defaults to the invoice.
 */
export default function InvoiceRow({ invoice, show = ALL, hideStatus = false, extra, to }) {
    const has = (part) => show.includes(part);
    const billedTo = invoice.billedTo || null;
    const showBilledTo = has('billedTo');
    const open = isInvoiceOpen(invoice);

    const title = showBilledTo ? (billedTo && billedTo.name) || 'Unknown' : <span className="tabular-nums">{invoice.invoiceNumber}</span>;
    const meta = [
        showBilledTo && has('number') ? <RecordNo key="number">{invoice.invoiceNumber}</RecordNo> : null,
        has('due') && invoice.baseStatus === 'ISSUED' ? (
            <DueLabel key="due" dueDate={invoice.dueDate} open={open} overdue={open ? Boolean(invoice.isOverdue) : undefined} />
        ) : null,
        hideStatus ? null : (
            <Badge key="status" tone={INVOICE_STATUS_TONE[invoice.displayedStatus]}>
                {invoiceStatusLabel(invoice.displayedStatus)}
            </Badge>
        ),
        ...(Array.isArray(extra) ? extra : extra ? [extra] : []),
    ];

    return (
        <ListRow
            to={to || `/invoices/${invoice.id}`}
            leading={showBilledTo && billedTo ? <ClientIcon type={billedTo.type} /> : undefined}
            title={title}
            trailing={<Amount invoice={invoice} />}
            meta={meta}
        />
    );
}
