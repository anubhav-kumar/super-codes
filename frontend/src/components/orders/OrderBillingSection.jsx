import { formatFigure, formatMoney } from '../../utils/format.js';
import DataView from '../DataView.jsx';
import InvoiceRow from '../InvoiceRow.jsx';
import KeyFigures from '../KeyFigures.jsx';
import Section from '../Section.jsx';
import StaleDataNotice from '../offline/StaleDataNotice.jsx';
import { orderBilling } from './orderBilling.js';

const rupees = (v) => formatMoney(v, { paise: 'none' });

function billedSub({ tax, draft }) {
    const parts = [tax > 0 ? `+ ${rupees(tax)} tax` : null, draft > 0 ? `incl. ${rupees(draft)} draft` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : undefined;
}

function notBilledSub({ notBilled, over }) {
    if (over > 0) return `${rupees(over)} more than the order amount`;
    return notBilled === 0 ? 'Fully billed' : undefined;
}

function caption({ billed, amount, notBilled, over, share }) {
    if (notBilled > 0) return `${rupees(billed)} of ${rupees(amount)} billed before tax (${share}%)`;
    if (over > 0) return `Fully billed: ${rupees(billed)} before tax, ${rupees(over)} more than the order amount`;
    return `Fully billed: ${rupees(billed)} of ${rupees(amount)} before tax`;
}

function BillingFigures({ figures }) {
    const { billed, received, outstanding, notBilled, share, overdue } = figures;
    return (
        <div className="px-4 pb-4">
            {/*
              Section-size figures: 2 x 2 in the Billing column (327-382 px), each value shrinks to fit.
              Top row compares like with like (before tax, against the order amount); bottom row is
              money received and owed, which includes tax.
            */}
            <KeyFigures
                size="section"
                items={[
                    { key: 'billed', label: 'Billed (excl. tax)', value: formatFigure(billed), sub: billedSub(figures) },
                    notBilled === null ? null : { key: 'not-billed', label: 'Not yet billed', value: formatFigure(notBilled), sub: notBilledSub(figures) },
                    { key: 'received', label: 'Received', value: formatFigure(received), sub: 'incl. tax' },
                    {
                        key: 'outstanding',
                        label: 'Outstanding',
                        value: formatFigure(outstanding),
                        tone: overdue ? 'danger' : undefined,
                        number: outstanding,
                        sub: overdue ? 'Overdue · incl. tax' : 'incl. tax',
                    },
                ]}
            />
            {share !== null && (
                <div className="mt-3">
                    <div
                        role="progressbar"
                        aria-label="Billed before tax against order amount"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={share}
                        className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
                    >
                        <div className="h-full rounded-full bg-ink" style={{ width: `${share}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted tabular-nums">{caption(figures)}</p>
                </div>
            )}
        </div>
    );
}

/**
 * "Billing" section on order detail (F-23, F-44): the figures from orderBilling(), a thin
 * billed-before-tax vs order amount bar and the order's invoices. Rows hide billed-to (the order's
 * client already heads the page). `invoices` is the useOrderInvoices() resource loaded once by the
 * page, so the Raise invoice button and these figures agree; a failure or a missing offline copy
 * stays inside the section.
 */
export default function OrderBillingSection({ order, invoices, className = '' }) {
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
