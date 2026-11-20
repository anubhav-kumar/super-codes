import { usePersonRequestedOrders } from '../hooks/useOrders.js';
import OrderRowList from './OrderRowList.jsx';
import ResourceSection from './ResourceSection.jsx';

/**
 * Orders a person requested on behalf of a company (F-08): number, company name, service, status,
 * due date. These never count toward the person's own outstanding.
 */
export default function PersonRequestedOrdersSection({ personId }) {
    const orders = usePersonRequestedOrders(personId);
    return (
        <ResourceSection title="Orders requested" resource={orders} count={(items) => items.length}>
            {(items) => (
                <OrderRowList
                    orders={items}
                    name={(o) => (o.client && o.client.name) || 'Unknown company'}
                    detail={(o) => o.serviceName}
                    emptyText="No orders requested for a company."
                />
            )}
        </ResourceSection>
    );
}
