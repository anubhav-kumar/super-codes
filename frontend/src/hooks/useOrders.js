import { useCallback } from 'react';
import { getOrder, listOrders } from '../api/orders.js';
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
