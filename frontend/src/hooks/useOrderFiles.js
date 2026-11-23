import { useCallback } from 'react';
import { listOrderFiles } from '../api/orderFiles.js';
import useResource from './useResource.js';

/** Present files of an order, newest first (F-62). Names and sizes only, never links. Pass null to skip. */
export function useOrderFiles(orderId) {
    const fetcher = useCallback(({ signal }) => listOrderFiles(orderId, { signal }), [orderId]);
    return useResource(orderId ? `order-files:${orderId}` : null, fetcher);
}
