import { useCallback } from 'react';
import { getOrder, listClientOrders, listOrders, listOrdersReceivedFrom } from '../api/orders.js';
import useResource from './useResource.js';

/** All orders, newest first. useResource shape: { status, data: Order[], fromCache, fetchedAt, error, reload }. */
export function useOrders() {
    return useResource('orders', listOrders);
}

/** One order (detail, including `assignments`). Pass null to skip loading. */
export function useOrder(id) {
    const fetcher = useCallback(({ signal }) => getOrder(id, { signal }), [id]);
    return useResource(id ? `order:${id}` : null, fetcher);
}

/** Orders where this person or company is the client (F-08), newest first. Pass null to skip loading. */
export function useClientOrders(clientId) {
    const fetcher = useCallback(({ signal }) => listClientOrders(clientId, { signal }), [clientId]);
    return useResource(clientId ? `client-orders:${clientId}` : null, fetcher);
}

/**
 * Orders this person requested on behalf of a company (F-08): ?receivedFromId= keeping only
 * company clients, newest first. Pass null to skip loading.
 */
export function usePersonRequestedOrders(personId) {
    const fetcher = useCallback(
        async ({ signal }) => {
            const res = await listOrdersReceivedFrom(personId, { signal });
            return { ...res, data: res.data.filter((o) => o.client && o.client.type === 'COMPANY') };
        },
        [personId],
    );
    return useResource(personId ? `requested-orders:${personId}` : null, fetcher);
}
