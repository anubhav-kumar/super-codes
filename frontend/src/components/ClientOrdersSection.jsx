import { useState } from 'react';
import { useClientOrders } from '../hooks/useOrders.js';
import { compareByDue, isOrderOpen } from '../utils/due.js';
import Icon from './Icon.jsx';
import OrderRow from './OrderRow.jsx';
import ResourceSection from './ResourceSection.jsx';

const ROW_PARTS = ['service', 'due', 'number'];

/** "From Ravi Mehta" when someone other than the client asked for the order. */
function receivedFromText(order) {
    const from = order.receivedFrom;
    if (!from || !from.name || (order.client && from.id === order.client.id)) return undefined;
    return `From ${from.name}`;
}

function OrderList({ orders, showReceivedFrom }) {
    return (
        <ul className="divide-y divide-line border-t border-line">
            {orders.map((o) => (
                <li key={o.id}>
                    <OrderRow order={o} show={ROW_PARTS} extra={showReceivedFrom ? receivedFromText(o) : undefined} />
                </li>
            ))}
        </ul>
    );
}

/**
 * Orders where a person or company is the client (F-08), anchored at #orders. Open orders first,
 * most urgent first (relative due labels, overdue in red); completed and cancelled orders stay
 * behind a "Show completed and cancelled (N)" footer.
 * Pass the page's useClientOrders() result as `orders` (so key figures and this section share one
 * load), or a `clientId` to load here. `action` is an optional SectionAction.
 */
export default function ClientOrdersSection({ orders: ordersResource, clientId, title = 'Open orders', showReceivedFrom = false, action }) {
    const own = useClientOrders(ordersResource ? null : clientId);
    const orders = ordersResource || own;
    const [showClosed, setShowClosed] = useState(false);

    const loaded = orders.status === 'loaded';
    const open = loaded ? orders.data.filter(isOrderOpen).sort(compareByDue) : [];
    const closed = loaded ? orders.data.filter((o) => !isOrderOpen(o)) : [];

    const footer =
        closed.length > 0 ? (
            <>
                {showClosed && <OrderList orders={closed} showReceivedFrom={showReceivedFrom} />}
                <button
                    type="button"
                    onClick={() => setShowClosed((v) => !v)}
                    aria-expanded={showClosed}
                    className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-b-card border-t border-line px-4 text-sm font-medium text-ink-muted transition hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                    {showClosed ? 'Hide completed and cancelled' : `Show completed and cancelled (${closed.length})`}
                    <Icon name="chevron-down" size="sm" className={showClosed ? 'rotate-180' : ''} />
                </button>
            </>
        ) : null;

    return (
        <ResourceSection id="orders" title={title} resource={orders} count={() => open.length} action={action} footer={footer}>
            {() =>
                open.length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-ink-muted">{closed.length > 0 ? 'No open orders.' : 'No orders yet.'}</p>
                ) : (
                    <OrderList orders={open} showReceivedFrom={showReceivedFrom} />
                )
            }
        </ResourceSection>
    );
}
