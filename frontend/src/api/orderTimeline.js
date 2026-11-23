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

/**
 * POST /timeline/orders/{orderId}/comments (F-60) with { id, text, status? }.
 * `id` is a client-generated UUID v4 (same id on a retry of the same post: the server answers 200 with
 * the existing comment). `status` turns the comment into a progress update.
 * -> data = { comment: Entry, statusEvent: Entry | null, order: { id, status, updatedAt } }.
 * Errors: 400 VALIDATION_FAILED (id | text | status), 404 NOT_FOUND, 409 ID_CONFLICT, 409 ORDER_CHANGED.
 */
export function postOrderComment(orderId, { id, text, status = null }) {
    const body = { id, text };
    if (status) body.status = status;
    return request(`/timeline/orders/${enc(orderId)}/comments`, { method: 'POST', body });
}
