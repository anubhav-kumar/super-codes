import { useBillingEntityInvoices } from '../hooks/useInvoices.js';
import { formatMoney } from '../utils/format.js';
import InvoiceStatusBadges from './InvoiceStatusBadges.jsx';
import ListItem from './ListItem.jsx';
import ResourceSection from './ResourceSection.jsx';

/**
 * Totals of a billing entity. Uses the server's summary; if the response has none, sums the
 * server's per-invoice values (outstanding is already 0 for Draft and Cancelled invoices).
 */
function totalsOf({ items, summary }) {
    if (summary) return summary;
    const sum = (pick) => items.reduce((acc, i) => acc + (Number(pick(i)) || 0), 0);
    return {
        totalOutstanding: sum((i) => i.outstanding),
        totalReceived: sum((i) => (i.baseStatus === 'CANCELLED' ? 0 : i.amountReceived)),
    };
}

function Totals({ totals }) {
    const outstanding = Number(totals.totalOutstanding) || 0;
    return (
        <dl className="mx-4 mb-3 grid grid-cols-2 gap-3 rounded-control bg-page p-3">
            <div>
                <dt className="text-sm text-ink-muted">Outstanding</dt>
                <dd className={`text-lg font-semibold tabular-nums ${outstanding > 0 ? 'text-warning' : 'text-ink'}`}>
                    {formatMoney(outstanding)}
                </dd>
            </div>
            <div>
                <dt className="text-sm text-ink-muted">Received</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink">{formatMoney(Number(totals.totalReceived) || 0)}</dd>
            </div>
        </dl>
    );
}

/**
 * Invoices billed to one person or company (F-08): number, total, received, outstanding, status,
 * and the total outstanding across them. Only invoices billed to this exact entity count, so
 * company invoices never add to a person's outstanding.
 */
export default function BilledInvoicesSection({ billedToId }) {
    const invoices = useBillingEntityInvoices(billedToId);
    return (
        <ResourceSection title="Invoices" resource={invoices} count={(data) => data.items.length}>
            {(data) => (
                <>
                    <Totals totals={totalsOf(data)} />
                    {data.items.length === 0 ? (
                        <p className="px-4 pb-4 text-sm text-ink-muted">No invoices yet.</p>
                    ) : (
                        <ul className="divide-y divide-line border-t border-line">
                            {data.items.map((i) => (
                                <li key={i.id}>
                                    <ListItem
                                        to={`/invoices/${i.id}`}
                                        title={<span className="font-mono text-sm">{i.invoiceNumber}</span>}
                                        subtitle={`Total ${formatMoney(i.total)} · Received ${formatMoney(i.amountReceived ?? 0)}`}
                                        meta={`Outstanding ${formatMoney(i.outstanding ?? 0)}`}
                                        badges={<InvoiceStatusBadges invoice={i} />}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </ResourceSection>
    );
}
