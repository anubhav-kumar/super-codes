import { useClientOrders } from '../hooks/useOrders.js';
import OrderRowList from './OrderRowList.jsx';
import ResourceSection from './ResourceSection.jsx';

/**
 * Orders where a person or company is the client (F-08): number, service, received from, status,
 * due date. Used on both the person and the company detail screens.
 */
export default function ClientOrdersSection({ clientId, title = 'Orders' }) {
    const orders = useClientOrders(clientId);
    return (
        <ResourceSection title={title} resource={orders} count={(items) => items.length}>
            {(items) => (
                <OrderRowList
                    orders={items}
                    name={(o) => o.serviceName}
                    detail={(o) => (o.receivedFrom && o.receivedFrom.name ? `Received from ${o.receivedFrom.name}` : '')}
                    emptyText="No orders yet."
                />
            )}
        </ResourceSection>
    );
}
