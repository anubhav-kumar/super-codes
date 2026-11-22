import { Link, useParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import DataView from '../components/DataView.jsx';
import DetailField from '../components/DetailField.jsx';
import DueLabel from '../components/DueLabel.jsx';
import InvoicePaymentsSection from '../components/InvoicePaymentsSection.jsx';
import MoneySummary from '../components/MoneySummary.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import RecordNo from '../components/RecordNo.jsx';
import { INVOICE_STATUS_TONE, invoiceStatusLabel } from '../constants/invoices.js';
import { clientPath } from '../constants/orders.js';
import { useInvoice } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { isInvoiceOpen } from '../utils/due.js';
import { formatDate } from '../utils/format.js';

const linkClass = 'text-ink underline-offset-2 hover:underline focus-visible:underline';

/** Outstanding tone and hint from server-derived fields only (F-07). */
function outstandingLook(invoice) {
    if (invoice.baseStatus === 'DRAFT') return { tone: 'neutral', hint: 'Nothing is due until the invoice is issued.' };
    if (invoice.baseStatus === 'CANCELLED') return { tone: 'neutral', hint: 'Cancelled invoices are not outstanding.' };
    if (Number(invoice.outstanding) > 0) return { tone: invoice.isOverdue ? 'danger' : 'neutral' };
    return { tone: 'success' };
}

function InvoiceDetail({ invoice }) {
    const { online } = useOnlineStatus();
    const toBilledTo = clientPath(invoice.billedTo);
    const billedToName = (invoice.billedTo && invoice.billedTo.name) || 'Unknown';
    const look = outstandingLook(invoice);

    return (
        <>
            <RecordHeader
                eyebrow={<RecordNo>{invoice.invoiceNumber}</RecordNo>}
                icon={invoice.billedTo ? invoice.billedTo.type : undefined}
                title={
                    toBilledTo ? (
                        <Link to={toBilledTo} className={linkClass}>
                            {billedToName}
                        </Link>
                    ) : (
                        billedToName
                    )
                }
                meta={[
                    // One status badge; for a partly paid invoice past due, the due label says "Overdue".
                    <Badge key="status" tone={INVOICE_STATUS_TONE[invoice.displayedStatus]}>
                        {invoiceStatusLabel(invoice.displayedStatus)}
                    </Badge>,
                    invoice.baseStatus === 'ISSUED' ? (
                        <DueLabel
                            key="due"
                            dueDate={invoice.dueDate}
                            open={isInvoiceOpen(invoice)}
                            overdue={isInvoiceOpen(invoice) ? Boolean(invoice.isOverdue) : undefined}
                        />
                    ) : null,
                ]}
                actions={
                    <Button variant="secondary" icon="edit" to={`/invoices/${invoice.id}/edit`} disabled={!online}>
                        Edit
                    </Button>
                }
            >
                {!online && <OfflineActionHint />}
            </RecordHeader>
            <Card>
                <dl className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Related order">
                        {invoice.order && invoice.order.id ? (
                            <Link to={`/orders/${invoice.order.id}`} className={`${linkClass} tabular-nums`}>
                                {invoice.order.orderNumber || 'Order'}
                            </Link>
                        ) : null}
                    </DetailField>
                    <DetailField label="Invoice date" value={formatDate(invoice.invoiceDate)} />
                    <DetailField label="Due date" value={formatDate(invoice.dueDate)} />
                    <DetailField label="Description" className="md:col-span-2">
                        {invoice.description ? <span className="whitespace-pre-line">{invoice.description}</span> : null}
                    </DetailField>
                </dl>
            </Card>
            <MoneySummary amount={invoice.amount} tax={invoice.tax} total={invoice.total} received={invoice.amountReceived} outstanding={invoice.outstanding} outstandingTone={look.tone} outstandingHint={look.hint} className="mt-4" />
            <InvoicePaymentsSection invoice={invoice} />
        </>
    );
}

/** Invoice detail (F-06, F-07): all fields, displayed status, links to billed-to and related order, money summary and payments. */
export default function InvoiceDetailPage() {
    const { invoiceId } = useParams();
    const invoice = useInvoice(invoiceId);
    return (
        <PageBody width="detail">
            <PageHeader backTo="/invoices" backLabel="Invoices" />
            <DataView resource={invoice} skeleton="detail" notFoundTitle="Invoice not found">{(i) => <InvoiceDetail invoice={i} reload={invoice.reload} />}</DataView>
        </PageBody>
    );
}
