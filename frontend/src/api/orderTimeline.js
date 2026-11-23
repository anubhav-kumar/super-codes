/** Order timeline and comments (backend contract FR2 P-27, service timeline). */
import { request } from './client.js';

const enc = encodeURIComponent;

/**
 * GET /timeline/orders/{orderId} -> data = { items: Entry[], latestActivityAt }.
 * Every entry of the order, oldest first, unpaginated. Entry: { id, orderId, kind: 'COMMENT' | 'EVENT',
 * createdAt, actor { id, name } } plus, for comments, text, editedAt, statusChange, mentions, files,
 * canEdit, canDelete, and for events, type and details. 404 NOT_FOUND when the order is out of scope.
 */
export async function listOrderTimeline(orderId, { signal } = {}) {
    const res = await request(`/timeline/orders/${enc(orderId)}`, { signal });
    const body = res.data || {};
    return {
        ...res,
        data: {
            items: Array.isArray(body.items) ? body.items : [],
            latestActivityAt: body.latestActivityAt ?? null,
        },
    };
}
