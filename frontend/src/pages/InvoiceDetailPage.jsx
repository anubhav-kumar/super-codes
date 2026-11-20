import { Link, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import DataView from '../components/DataView.jsx';
import DetailField from '../components/DetailField.jsx';
import InvoiceStatusBadges from '../components/InvoiceStatusBadges.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { clientPath } from '../constants/orders.js';
import { useInvoice } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { formatDate, formatMoney } from '../utils/format.js';

const linkClass = 'text-primary-700 hover:underline';

const Money = ({ value, strong = false }) =>
    value === null || value === undefined ? null : (
        <span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{formatMoney(value)}</span>
    );

function InvoiceDetail({ invoice }) {
    const { online } = useOnlineStatus();
    const toBilledTo = clientPath(invoice.billedTo);
    const billedToName = (invoice.billedTo && invoice.billedTo.name) || 'Unknown';

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
                    <DetailField label="Amount">
                        <Money value={invoice.amount} />
                    </DetailField>
                    <DetailField label="Tax">
                        <Money value={invoice.tax} />
                    </DetailField>
                    <DetailField label="Total">
                        <Money value={invoice.total} strong />
                    </DetailField>
                    <DetailField label="Description" className="md:col-span-2">
                        {invoice.description ? <span className="whitespace-pre-line">{invoice.description}</span> : null}
                    </DetailField>
                </dl>
            </Card>
            {/* Sections added by F-07 (one line each): MoneySummary, InvoicePaymentsSection. */}
        </>
    );
}

/** Invoice detail (F-06): all fields, displayed status, links to billed-to and related order. */
export default function InvoiceDetailPage() {
    const { invoiceId } = useParams();
    const invoice = useInvoice(invoiceId);
    return <DataView resource={invoice}>{(i) => <InvoiceDetail invoice={i} reload={invoice.reload} />}</DataView>;
}
