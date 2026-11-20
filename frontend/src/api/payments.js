/**
 * Payments of an invoice (backend contract P-05, F-07, service billing).
 * There is no payments list or get route: an invoice's payments come inside the invoice detail
 * (GET /billing/invoices/{id} -> payments[]), loaded with getInvoice() in api/invoices.js.
 */
import { request } from './client.js';

const enc = encodeURIComponent;

/**
 * POST /billing/invoices/{invoiceId}/payments with a client-generated UUID in body.id
 * -> 201 Payment object with paymentNumber (200 with the existing payment when that id exists).
 * 409 INVOICE_NOT_ISSUED when the invoice's base status is not ISSUED.
 */
export function createPayment(invoiceId, body) {
    return request(`/billing/invoices/${enc(invoiceId)}/payments`, { method: 'POST', body });
}

/** PUT /billing/invoices/{invoiceId}/payments/{paymentId} with the full editable field set (status required). */
export function updatePayment(invoiceId, paymentId, body) {
    return request(`/billing/invoices/${enc(invoiceId)}/payments/${enc(paymentId)}`, { method: 'PUT', body });
}
