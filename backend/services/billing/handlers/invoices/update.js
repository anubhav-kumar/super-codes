'use strict';

const { middleware, errors, validators, http, logger } = require('common');
const { parseInvoice } = require('../../validators/invoice');
const { getInvoice, getPayments, updateInvoiceItem, checkReferences } = require('../../models/invoice');
const { toInvoiceDetail } = require('../../utils/enrich');

/**
 * PUT /billing/invoices/{id}   full editable field set
 * 200 Invoice detail
 * 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND, 404 NOT_FOUND
 *
 * invoiceNumber never changes and receivedPaise is not touched (UpdateItem, not Put). Any base
 * status change is allowed. Recomputes totalPaise, sortKey and dueSortKey; REMOVEs orderId and
 * description when null.
 */
module.exports.handler = middleware.withHandler(async ({ event, body }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const fields = parseInvoice(body, { isCreate: false });

    const existing = await getInvoice(id, { consistent: true });
    if (!existing) throw errors.notFound();

    const lookups = await checkReferences(fields);

    const now = new Date().toISOString();
    const item = await updateInvoiceItem(existing, fields, now);
    if (!item) throw errors.notFound();

    const payments = await getPayments(id, { consistent: true });

    logger.info('invoice updated', { invoiceId: id, baseStatus: item.baseStatus });
    return http.ok(toInvoiceDetail(item, payments, lookups));
});
