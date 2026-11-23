'use strict';

const { middleware, errors, validators, http, logger } = require('common');
const { parsePayment } = require('../../validators/payment');
const { getInvoice } = require('../../models/invoice');
const { updatePaymentItem, recomputeReceived } = require('../../models/payment');
const { toPayment } = require('../../utils/enrich');

/**
 * PUT /billing/invoices/{id}/payments/{paymentId}   full editable field set, status required
 * 200 Payment object
 * 400 VALIDATION_FAILED, 404 NOT_FOUND (invoice or payment)
 * Admin only: a member gets 404 NOT_FOUND.
 *
 * Allowed whatever the invoice's base status. paymentNumber and createdDate never change.
 * Recomputes the invoice's receivedPaise. Never touches Orders.
 */
module.exports.handler = middleware.withHandler(async ({ event, body }) => {
    const params = event.pathParameters || {};
    const invoiceId = params.id;
    const paymentId = params.paymentId;
    if (!validators.isUuidV4(invoiceId) || !validators.isUuidV4(paymentId)) throw errors.notFound();

    const fields = parsePayment(body, { isCreate: false });

    const invoice = await getInvoice(invoiceId, { consistent: true });
    if (!invoice) throw errors.notFound();

    const now = new Date().toISOString();
    const item = await updatePaymentItem(invoiceId, paymentId, fields, now);
    if (!item) throw errors.notFound();

    await recomputeReceived(invoiceId, now);

    logger.info('payment updated', { invoiceId, paymentId, status: item.status });
    return http.ok(toPayment(item));
}, { adminOnly: true });
