'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, http, logger } = require('common');
const { parseInvoice } = require('../../validators/invoice');
const {
    buildNewInvoiceItem,
    getInvoice,
    nextInvoiceSeq,
    checkReferences,
    loadInvoiceDetail,
} = require('../../models/invoice');
const { toInvoiceDetail } = require('../../utils/enrich');

/**
 * POST /billing/invoices
 * 201 Invoice detail (baseStatus DRAFT or ISSUED as requested, invoiceNumber assigned, payments [])
 * 200 Invoice detail when an invoice with this id already exists (nothing written, stored baseStatus kept)
 * 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND
 * Admin only: a member gets 404 NOT_FOUND.
 *
 * Flow: validate -> GetItem id -> check references -> increment counter -> PutItem with
 * attribute_not_exists(id). Billed-to is never derived from the order. A counter number lost to a
 * failed or raced write leaves a gap in the sequence (accepted).
 */
module.exports.handler = middleware.withHandler(async ({ body }) => {
    const fields = parseInvoice(body, { isCreate: true });
    const { id } = fields;

    const existing = await getInvoice(id, { consistent: true });
    if (existing) return http.ok(await loadInvoiceDetail(existing, { consistent: true }));

    const lookups = await checkReferences(fields);

    const seq = await nextInvoiceSeq();
    const now = new Date().toISOString();
    const item = buildNewInvoiceItem(id, seq, fields, now);

    try {
        await database.doc.send(
            new PutCommand({
                TableName: process.env.INVOICES_TABLE,
                Item: item,
                ConditionExpression: 'attribute_not_exists(id)',
            })
        );
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') {
            const raced = await getInvoice(id, { consistent: true });
            if (raced) return http.ok(await loadInvoiceDetail(raced, { consistent: true }));
        }
        throw err;
    }

    logger.info('invoice created', { invoiceId: id, invoiceNumber: item.invoiceNumber });
    return http.created(toInvoiceDetail(item, [], lookups));
}, { adminOnly: true });
