'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http } = require('common');
const { DISPLAYED_STATUS_FILTERS } = require('../../validators/invoice');
const { ENTITY } = require('../../models/invoice');
const { deriveInvoiceStatus } = require('../../utils/invoiceStatus');
const { enrichInvoices } = require('../../utils/enrich');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const FILTERS = ['orderId', 'billedToId', 'status'];
const ID_FILTER_INDEX = { orderId: 'byOrder', billedToId: 'byBilledTo' };

function parseLimit(raw) {
    if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 1 && n <= MAX_LIMIT ? n : null;
}

/** A nextToken that decodes but is not a key of this index makes DynamoDB reject the query: 400. */
async function sendListQuery(command, startKey) {
    try {
        return await database.doc.send(command);
    } catch (err) {
        if (startKey && err && err.name === 'ValidationException') {
            throw errors.validationFailed([{ field: 'nextToken', message: 'nextToken is not valid' }]);
        }
        throw err;
    }
}

/** Newest invoice date first, then highest invoice number first. */
function byNewest(a, b) {
    return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0;
}

function queryByBaseStatus(baseStatus, { dueBefore } = {}) {
    const params = {
        TableName: process.env.INVOICES_TABLE,
        IndexName: 'byBaseStatus',
        KeyConditionExpression: '#baseStatus = :baseStatus',
        ExpressionAttributeNames: { '#baseStatus': 'baseStatus' },
        ExpressionAttributeValues: { ':baseStatus': baseStatus },
    };
    if (dueBefore) {
        // dueSortKey = <dueDate>#<seq>; every key with dueDate < today sorts before "<today>".
        params.KeyConditionExpression += ' AND #dueSortKey < :today';
        params.ExpressionAttributeNames['#dueSortKey'] = 'dueSortKey';
        params.ExpressionAttributeValues[':today'] = dueBefore;
    }
    return database.queryAll(params);
}

/** Items for a displayed-status filter (section 4, F-06/F-07 List invoices). */
async function itemsForStatus(status) {
    if (status === 'DRAFT' || status === 'CANCELLED') return queryByBaseStatus(status);

    const today = validators.todayIst();
    if (status === 'OVERDUE') {
        const items = await queryByBaseStatus('ISSUED', { dueBefore: today });
        return items.filter((i) => deriveInvoiceStatus(i, today).isOverdue);
    }
    const items = await queryByBaseStatus('ISSUED');
    if (status === 'UNPAID') return items.filter((i) => deriveInvoiceStatus(i, today).outstandingPaise > 0);
    return items.filter((i) => deriveInvoiceStatus(i, today).displayedStatus === status);
}

/**
 * summary for the orderId and billedToId lists (F-08). Summed in paise, then converted to INR.
 * totalOutstanding sums outstanding (0 for DRAFT/CANCELLED); totalReceived skips CANCELLED invoices.
 */
function summarize(items, today) {
    let outstandingPaise = 0;
    let receivedPaise = 0;
    for (const item of items) {
        const derived = deriveInvoiceStatus(item, today);
        outstandingPaise += derived.outstandingPaise;
        if (item.baseStatus !== 'CANCELLED') receivedPaise += derived.receivedPaise;
    }
    return { totalOutstanding: validators.toInr(outstandingPaise), totalReceived: validators.toInr(receivedPaise) };
}

/**
 * GET /billing/invoices?limit=&nextToken=   all invoices, paginated
 * GET /billing/invoices?orderId=<uuid>      invoices of an order, unpaginated, with summary
 * GET /billing/invoices?billedToId=<uuid>   invoices billed to a person/company, unpaginated, with summary
 * GET /billing/invoices?status=<STATUS>     DRAFT|ISSUED|PARTIALLY_PAID|PAID|OVERDUE|CANCELLED|UNPAID, unpaginated
 * Sorted newest invoice date first, then highest invoice number first.
 * 200 { items: [Invoice], nextToken: string | null }, 400 VALIDATION_FAILED
 * orderId / billedToId lists add summary: { totalOutstanding, totalReceived }.
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const query = event.queryStringParameters || {};
    const given = FILTERS.filter((f) => query[f] !== undefined);
    if (given.length > 1) {
        throw errors.validationFailed(
            given.map((f) => ({ field: f, message: 'Use only one filter per request' })),
            'Use only one filter per request'
        );
    }

    const idFilter = given.find((f) => ID_FILTER_INDEX[f]);
    if (idFilter) {
        const id = query[idFilter];
        if (!validators.isUuidV4(id)) {
            throw errors.validationFailed([{ field: idFilter, message: `${idFilter} must be a lowercase UUID v4` }]);
        }
        const items = await database.queryAll({
            TableName: process.env.INVOICES_TABLE,
            IndexName: ID_FILTER_INDEX[idFilter],
            KeyConditionExpression: '#key = :id',
            ExpressionAttributeNames: { '#key': idFilter },
            ExpressionAttributeValues: { ':id': id },
            ScanIndexForward: false,
        });
        const summary = summarize(items, validators.todayIst());
        return http.ok({ items: await enrichInvoices(items), nextToken: null, summary });
    }

    if (query.status !== undefined) {
        if (!DISPLAYED_STATUS_FILTERS.includes(query.status)) {
            throw errors.validationFailed([
                { field: 'status', message: `Status must be one of ${DISPLAYED_STATUS_FILTERS.join(', ')}` },
            ]);
        }
        const items = (await itemsForStatus(query.status)).sort(byNewest);
        return http.ok({ items: await enrichInvoices(items), nextToken: null });
    }

    const limit = parseLimit(query.limit);
    if (limit === null) {
        throw errors.validationFailed([{ field: 'limit', message: `limit must be an integer from 1 to ${MAX_LIMIT}` }]);
    }
    const startKey = database.decodeToken(query.nextToken);

    const res = await sendListQuery(
        new QueryCommand({
            TableName: process.env.INVOICES_TABLE,
            IndexName: 'byDate',
            KeyConditionExpression: '#entity = :entity',
            ExpressionAttributeNames: { '#entity': 'entity' },
            ExpressionAttributeValues: { ':entity': ENTITY },
            ScanIndexForward: false,
            Limit: limit,
            ExclusiveStartKey: startKey,
        }),
        startKey
    );
    return http.ok({
        items: await enrichInvoices(res.Items || []),
        nextToken: database.encodeToken(res.LastEvaluatedKey),
    });
});
