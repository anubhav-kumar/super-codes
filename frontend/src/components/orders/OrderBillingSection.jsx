import { useOrderInvoices } from '../../hooks/useInvoices.js';
import { formatMoney } from '../../utils/format.js';
import DataView from '../DataView.jsx';
import InvoiceRow from '../InvoiceRow.jsx';
import KeyFigures from '../KeyFigures.jsx';
import Section from '../Section.jsx';
import StaleDataNotice from '../offline/StaleDataNotice.jsx';

const num = (v) => {
    const n = v === null || v === undefined || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? n : 0;
};
const hasAmount = (amount) => amount !== null && amount !== undefined && amount !== '' && Number.isFinite(Number(amount));
// Sums in paise so 0.1 + 0.2 style float noise never shows up in a figure.
const sum = (items, pick) => items.reduce((total, i) => total + Math.round(num(pick(i)) * 100), 0) / 100;

/**
 * Billed / received / outstanding for one order, from the order's invoices (non-cancelled only).
 * Billed counts drafts too; outstanding is the server's per-invoice figure (0 for drafts), so
 * billed − received can exceed outstanding while a draft exists (the Billed tile says so).
 * Not yet billed = amount − billed, never below 0; null when the order has no amount.
 */
export function orderBilling(order, invoices) {
    const active = (invoices || []).filter((i) => i.baseStatus !== 'CANCELLED');
    const billed = sum(active, (i) => i.total);
    const draft = sum(
        active.filter((i) => i.baseStatus === 'DRAFT'),
        (i) => i.total
    );
    const received = sum(active, (i) => i.amountReceived);
    const outstanding = sum(active, (i) => i.outstanding);
    const amount = hasAmount(order.amount) ? Number(order.amount) : null;
    const notBilled = amount === null ? null : Math.max(0, Math.round((amount - billed) * 100) / 100);
    return { billed, draft, received, outstanding, amount, notBilled, overdue: active.some((i) => i.isOverdue) };
}

function BillingFigures({ figures }) {
    const { billed, draft, received, outstanding, amount, notBilled, overdue } = figures;
    const share = amount > 0 ? Math.min(100, Math.round((billed / amount) * 100)) : null;
    return (
        <div className="px-4 pb-4">
            <KeyFigures
                items={[
                    { key: 'billed', label: 'Billed', value: formatMoney(billed), sub: draft > 0 ? `incl. ${formatMoney(draft)} draft` : undefined },
                    { key: 'received', label: 'Received', value: formatMoney(received) },
                    { key: 'outstanding', label: 'Outstanding', value: formatMoney(outstanding), tone: overdue ? 'danger' : undefined, number: outstanding, sub: overdue ? 'Overdue' : undefined },
                    notBilled === null ? null : { key: 'not-billed', label: 'Not yet billed', value: formatMoney(notBilled) },
                ]}
            />
            {share !== null && (
                <div className="mt-3">
                    <div
                        role="progressbar"
                        aria-label="Billed against order amount"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={share}
                        className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
                    >
                        <div className="h-full rounded-full bg-ink" style={{ width: `${share}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted tabular-nums">
                        {formatMoney(billed)} of {formatMoney(amount)} billed ({share}%)
                    </p>
                </div>
            )}
        </div>
    );
}

/**
 * "Billing" section on order detail (F-23): the four figures, a thin billed-vs-amount bar and the
 * order's invoices. Rows hide billed-to (the order's client already heads the page), so on a phone
 * each row is just the INV number, the amount owed, the due label and the status. Loads on its own,
 * so a failure or a missing offline copy stays inside the section.
 */
export default function OrderBillingSection({ order, className = '' }) {
    const invoices = useOrderInvoices(order.id);
    const loaded = invoices.status === 'loaded';
    const items = (loaded && invoices.data) || [];

    return (
        <Section id="billing" title="Billing" count={loaded && items.length > 0 ? items.length : ''} className={className}>
            {!loaded ? (
                <div className="px-4 pb-4">
                    <DataView resource={invoices} compact />
                </div>
            ) : (
                <>
                    {invoices.fromCache && <StaleDataNotice fetchedAt={invoices.fetchedAt} className="mx-4 mb-3" />}
                    {items.length === 0 ? (
                        <p className="px-4 pb-4 text-sm text-ink-muted">Not billed yet.</p>
                    ) : (
                        <>
                            <BillingFigures figures={orderBilling(order, items)} />
                            <ul className="divide-y divide-line border-t border-line">
                                {items.map((i) => (
                                    <li key={i.id}>
                                        <InvoiceRow invoice={i} show={['number', 'due']} />
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </>
            )}
        </Section>
    );
}
