import { usePersonRequestedOrders } from '../hooks/useOrders.js';
import { compareByDue, isOrderOpen } from '../utils/due.js';
import OrderRow from './OrderRow.jsx';
import ResourceSection from './ResourceSection.jsx';

const ROW_PARTS = ['client', 'service', 'due', 'number'];

/** Open orders first by urgency, then the closed ones in the server's order (newest first). */
function ordered(items) {
    return [...items.filter(isOrderOpen).sort(compareByDue), ...items.filter((o) => !isOrderOpen(o))];
}

/**
 * Orders a person requested on behalf of a company (F-08), anchored at #requested: company,
 * service, relative due label, number and status. These never count toward the person's figures.
 */
export default function PersonRequestedOrdersSection({ personId }) {
    const orders = usePersonRequestedOrders(personId);
    return (
        <ResourceSection id="requested" title="Orders requested" resource={orders} count={(items) => items.length}>
            {(items) =>
                items.length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-ink-muted">No orders requested for a company.</p>
                ) : (
                    <ul className="divide-y divide-line border-t border-line">
                        {ordered(items).map((o) => (
                            <li key={o.id}>
                                <OrderRow order={o} show={ROW_PARTS} />
                            </li>
                        ))}
                    </ul>
                )
            }
        </ResourceSection>
    );
}
