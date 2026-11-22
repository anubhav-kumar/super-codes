import { useBillingEntityInvoices } from '../hooks/useInvoices.js';
import { isInvoiceOpen } from '../utils/due.js';
import { formatMoney } from '../utils/format.js';
import InvoiceRow from './InvoiceRow.jsx';
import ResourceSection from './ResourceSection.jsx';
import SummaryStrip from './SummaryStrip.jsx';

const ROW_PARTS = ['number', 'due'];

/** Open invoices first, largest outstanding first; then the rest in the server's order (newest first). */
function ordered(items) {
    const open = items.filter(isInvoiceOpen).sort((a, b) => (Number(b.outstanding) || 0) - (Number(a.outstanding) || 0));
    return [...open, ...items.filter((i) => !isInvoiceOpen(i))];
}

/**
 * Totals line for screens without key figures. Uses the server's summary; if the response has none,
 * sums the server's per-invoice values (outstanding is already 0 for Draft and Cancelled invoices).
 */
function Totals({ items, summary }) {
    const sum = (pick) => items.reduce((acc, i) => acc + (Number(pick(i)) || 0), 0);
    const totals = summary || {
        totalOutstanding: sum((i) => i.outstanding),
        totalReceived: sum((i) => (i.baseStatus === 'CANCELLED' ? 0 : i.amountReceived)),
    };
    return (
        <SummaryStrip
            className="px-4 pb-3"
            items={[
                { label: 'Outstanding', value: formatMoney(Number(totals.totalOutstanding) || 0, { paise: 'none' }) },
                { label: 'Received', value: formatMoney(Number(totals.totalReceived) || 0, { paise: 'none' }) },
            ]}
        />
    );
}

/**
 * Invoices billed to one person or company (F-08), anchored at #invoices: number, relative due
 * label, outstanding (red when overdue) and one status badge. Only invoices billed to this exact
 * entity count, so company invoices never add to a person's outstanding.
 * Pass the page's useBillingEntityInvoices() result as `invoices`, or a `billedToId` to load here.
 * `showTotals` adds an Outstanding · Received line (for screens without key figures).
 */
export default function BilledInvoicesSection({ invoices: invoicesResource, billedToId, showTotals = false, action }) {
    const own = useBillingEntityInvoices(invoicesResource ? null : billedToId);
    const invoices = invoicesResource || own;

    return (
        <ResourceSection id="invoices" title="Invoices" resource={invoices} count={(data) => data.items.length} action={action}>
            {(data) => (
                <>
                    {showTotals && data.items.length > 0 && <Totals items={data.items} summary={data.summary} />}
                    {data.items.length === 0 ? (
                        <p className="px-4 pb-4 text-sm text-ink-muted">No invoices yet.</p>
                    ) : (
                        <ul className="divide-y divide-line border-t border-line">
                            {ordered(data.items).map((i) => (
                                <li key={i.id}>
                                    <InvoiceRow invoice={i} show={ROW_PARTS} />
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </ResourceSection>
    );
}
