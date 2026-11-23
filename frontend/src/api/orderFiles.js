/**
 * Private order files (backend contract FR2 P-28, service files). Upload flow
 * (frontend-architecture.md 15.1, private variant): startUpload -> client.uploadFile -> completeUpload.
 * File items never carry a link or a storage key.
 */
import { request } from './client.js';

const enc = encodeURIComponent;
const base = (orderId) => `/files/orders/${enc(orderId)}`;

/** GET /files/orders/{orderId} -> data = File[] (PRESENT only, newest uploadedAt first). 404 NOT_FOUND. */
export async function listOrderFiles(orderId, { signal } = {}) {
    const res = await request(base(orderId), { signal });
    return { ...res, data: (res.data && Array.isArray(res.data.items) && res.data.items) || [] };
}

/**
 * POST /files/orders/{orderId}/uploads { id, fileName, size } -> 201/200
 * { file, uploadUrl, uploadHeaders, uploadExpiresAt }. `id` is client-generated; the same id again
 * returns a fresh URL for the same file (or uploadUrl null when the file is already PRESENT).
 * 400 VALIDATION_FAILED (fileName, size), 404 NOT_FOUND, 409 ID_CONFLICT.
 */
export function startOrderFileUpload(orderId, { id, fileName, size }, { signal } = {}) {
    return request(`${base(orderId)}/uploads`, { method: 'POST', body: { id, fileName, size }, signal });
}

/** POST /files/orders/{orderId}/{fileId}/complete -> { file } (PRESENT). 404, 409 UPLOAD_INCOMPLETE. */
export function completeOrderFileUpload(orderId, fileId, { signal } = {}) {
    return request(`${base(orderId)}/${enc(fileId)}/complete`, { method: 'POST', signal });
}
