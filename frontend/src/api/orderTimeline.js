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

/**
 * PUT /timeline/orders/{orderId}/comments/{commentId} (F-61) with { text } only (never a status).
 * Author only (admins too edit only their own). -> data = { comment: Entry } with editedAt set
 * (unchanged text: nothing written, editedAt unchanged).
 * Errors: 400 VALIDATION_FAILED (text), 403 NOT_COMMENT_AUTHOR, 404 NOT_FOUND (scope, unknown or deleted id).
 */
export function updateOrderComment(orderId, commentId, { text }) {
    return request(`/timeline/orders/${enc(orderId)}/comments/${enc(commentId)}`, { method: 'PUT', body: { text } });
}

/**
 * DELETE /timeline/orders/{orderId}/comments/{commentId} (F-61). 204, empty body; also 204 when the
 * comment is already gone. Author, or any admin. The order status and a progress update's status
 * changed event stay. Errors: 403 NOT_COMMENT_AUTHOR (member, another user's comment), 404 NOT_FOUND.
 */
export function deleteOrderComment(orderId, commentId) {
    return request(`/timeline/orders/${enc(orderId)}/comments/${enc(commentId)}`, { method: 'DELETE' });
}
