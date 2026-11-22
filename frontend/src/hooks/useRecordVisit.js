import { useEffect } from 'react';
import { describeRecord, recordVisit, removeRecent } from '../utils/recent.js';

/**
 * Adds a detail screen's record to "Recently opened" on this device once it has loaded, and drops
 * it from the list when the record no longer exists (the load ended in a 404, which DataView shows
 * as Not found).
 *   useRecordVisit('order', orderId, order);   // order = the useResource() result of the screen
 * type: 'person' | 'company' | 'order' | 'invoice' | 'worker' (see utils/recent.js).
 */
export default function useRecordVisit(type, id, resource) {
    const status = resource ? resource.status : null;
    const notFound = status === 'error' && resource.error && resource.error.status === 404;
    const described = status === 'loaded' ? describeRecord(type, resource.data) : null;
    const title = described ? described.title : null;
    const subtitle = described ? described.subtitle : null;

    useEffect(() => {
        if (!id) return;
        if (notFound) removeRecent(type, id);
        else if (title) recordVisit({ type, id, title, subtitle });
    }, [type, id, notFound, title, subtitle]);
}
