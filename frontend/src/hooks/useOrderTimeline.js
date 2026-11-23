import { useCallback } from 'react';
import { listOrderTimeline } from '../api/orderTimeline.js';
import useResource from './useResource.js';

/** Timeline of one order, oldest first. data = { items: Entry[], latestActivityAt }. Pass null to skip loading. */
export default function useOrderTimeline(orderId) {
    const fetcher = useCallback(({ signal }) => listOrderTimeline(orderId, { signal }), [orderId]);
    return useResource(orderId ? `order-timeline:${orderId}` : null, fetcher);
}
