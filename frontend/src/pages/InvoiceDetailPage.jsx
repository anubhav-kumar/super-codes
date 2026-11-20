import { Link, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import DataView from '../components/DataView.jsx';
import DetailField from '../components/DetailField.jsx';
import InvoicePaymentsSection from '../components/InvoicePaymentsSection.jsx';
import InvoiceStatusBadges from '../components/InvoiceStatusBadges.jsx';
import MoneySummary from '../components/MoneySummary.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { clientPath } from '../constants/orders.js';
import { useInvoice } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { formatDate } from '../utils/format.js';

const linkClass = 'text-primary-700 hover:underline';

/** Outstanding tone and hint from server-derived fields only (F-07). */
function outstandingLook(invoice) {
    if (invoice.baseStatus === 'DRAFT') return { tone: 'neutral', hint: 'Nothing is due until the invoice is issued.' };
    if (invoice.baseStatus === 'CANCELLED') return { tone: 'neutral', hint: 'Cancelled invoices are not outstanding.' };
    if (Number(invoice.outstanding) > 0) return { tone: invoice.isOverdue ? 'danger' : 'warning' };
    return { tone: 'success' };
}

function InvoiceDetail({ invoice }) {
    const { online } = useOnlineStatus();
    const toBilledTo = clientPath(invoice.billedTo);
    const billedToName = (invoice.billedTo && invoice.billedTo.name) || 'Unknown';
    const look = outstandingLook(invoice);

    return (
        <>
            <PageHeader
                title={<span className="font-mono">{invoice.invoiceNumber}</span>}
                subtitle={`Billed to ${billedToName}`}
                actions={
                    <Button variant="secondary" icon="edit" to={`/invoices/${invoice.id}/edit`} disabled={!online}>
                        Edit
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="-mt-2 mb-4" />}
            <Card>
                <dl className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Status">
                        <span className="flex flex-wrap gap-1">
                            <InvoiceStatusBadges invoice={invoice} />
                        </span>
                    </DetailField>
                    <DetailField label="Billed to">
                        {toBilledTo ? (
                            <Link to={toBilledTo} className={linkClass}>
                                {billedToName}
                            </Link>
                        ) : null}
                        {invoice.billedTo && (
                            <span className="ml-2 text-sm text-ink-muted">{invoice.billedTo.type === 'COMPANY' ? 'Company' : 'Person'}</span>
                        )}
                    </DetailField>
                    <DetailField label="Related order">
                        {invoice.order && invoice.order.id ? (
                            <Link to={`/orders/${invoice.order.id}`} className={`${linkClass} font-mono text-sm`}>
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
    return <DataView resource={invoice}>{(i) => <InvoiceDetail invoice={i} reload={invoice.reload} />}</DataView>;
}
