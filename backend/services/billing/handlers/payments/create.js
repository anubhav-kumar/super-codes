'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const { parsePayment } = require('../../validators/payment');
const { getInvoice } = require('../../models/invoice');
const { buildNewPaymentItem, getPayment, nextPaymentSeq, recomputeReceived } = require('../../models/payment');
const { toPayment } = require('../../utils/enrich');

/**
 * POST /billing/invoices/{id}/payments
 * 201 Payment object
 * 200 Payment object when a payment with this id already exists on this invoice (nothing written)
 * 400 VALIDATION_FAILED, 404 NOT_FOUND (invoice), 409 INVOICE_NOT_ISSUED
 * Admin only: a member gets 404 NOT_FOUND.
 *
 * Flow: validate -> GetItem invoice -> GetItem payment (idempotent retry) -> base status must be
 * ISSUED -> increment PAYMENT counter -> PutItem with attribute_not_exists(id) -> recompute the
 * invoice's receivedPaise. Never touches Orders.
 */
module.exports.handler = middleware.withHandler(async ({ event, body }) => {
    const invoiceId = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(invoiceId)) throw errors.notFound();

    const fields = parsePayment(body, { isCreate: true });

    const invoice = await getInvoice(invoiceId, { consistent: true });
    if (!invoice) throw errors.notFound();

    const existing = await getPayment(invoiceId, fields.id, { consistent: true });
    if (existing) return http.ok(toPayment(existing));

    if (invoice.baseStatus !== 'ISSUED') {
        throw errors.conflict('INVOICE_NOT_ISSUED', 'Payments can be added only to issued invoices');
    }

    const seq = await nextPaymentSeq();
    const now = new Date().toISOString();
    const item = buildNewPaymentItem(invoiceId, seq, fields, validators.todayIst(), now);

    try {
        await database.doc.send(
            new PutCommand({
                TableName: process.env.PAYMENTS_TABLE,
                Item: item,
                ConditionExpression: 'attribute_not_exists(id)',
            })
        );
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') {
            const raced = await getPayment(invoiceId, fields.id, { consistent: true });
            if (raced) return http.ok(toPayment(raced));
        }
        throw err;
    }

    await recomputeReceived(invoiceId, now);

    logger.info('payment created', { invoiceId, paymentId: item.id, paymentNumber: item.paymentNumber, status: item.status });
    return http.created(toPayment(item));
}, { adminOnly: true });
