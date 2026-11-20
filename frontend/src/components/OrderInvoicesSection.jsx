import { useOrderInvoices } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { formatMoney } from '../utils/format.js';
import Button from './Button.jsx';
import DataView from './DataView.jsx';
import InvoiceStatusBadges from './InvoiceStatusBadges.jsx';
import ListItem from './ListItem.jsx';
import StaleDataNotice from './offline/StaleDataNotice.jsx';
import RelatedSection from './RelatedSection.jsx';

/**
 * "Invoices" section on the order detail screen (F-06): number, billed to, total and status of each
 * invoice of the order (F-08 adds received and outstanding per invoice), "Not billed" when none, and the "Raise invoice" action. Loads on its own,
 * so a failure or a missing offline copy stays inside the section.
 */
export default function OrderInvoicesSection({ orderId }) {
    const { online } = useOnlineStatus();
    const invoices = useOrderInvoices(orderId);
    const loaded = invoices.status === 'loaded';
    const items = (loaded && invoices.data) || [];

    return (
        <RelatedSection
            title="Invoices"
            count={loaded ? items.length : ''}
            className="mt-4"
            action={
                <Button size="sm" variant="secondary" icon="plus" to={`/invoices/new?orderId=${orderId}`} disabled={!online}>
                    Raise invoice
                </Button>
            }
        >
            {!loaded ? (
                <div className="px-4 pb-4">
                    <DataView resource={invoices} compact />
                </div>
            ) : (
                <>
                    {invoices.fromCache && <StaleDataNotice fetchedAt={invoices.fetchedAt} className="mx-4 mb-3" />}
                    {items.length === 0 ? (
                        <p className="px-4 pb-4 text-sm text-ink-muted">Not billed</p>
                    ) : (
                        <ul className="divide-y divide-line border-t border-line">
                            {items.map((i) => (
                                <li key={i.id}>
                                    <ListItem
                                        to={`/invoices/${i.id}`}
                                        title={<span className="font-mono text-sm">{i.invoiceNumber}</span>}
                                        subtitle={[
                                            i.billedTo && i.billedTo.name ? `Billed to ${i.billedTo.name}` : null,
                                            `Received ${formatMoney(i.amountReceived ?? 0)}`,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        meta={`${formatMoney(i.total)} · Outstanding ${formatMoney(i.outstanding ?? 0)}`}
                                        badges={<InvoiceStatusBadges invoice={i} />}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </RelatedSection>
    );
}
