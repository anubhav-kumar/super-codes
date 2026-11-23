'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http } = require('common');
const { DISPLAYED_STATUS_FILTERS } = require('../../validators/invoice');
const { ENTITY } = require('../../models/invoice');
const { deriveInvoiceStatus } = require('../../utils/invoiceStatus');
const { enrichInvoices } = require('../../utils/enrich');
const scope = require('common/scope');
const { byNewest, visibleInvoiceItems, memberClients } = require('../../utils/memberInvoices');

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

/** Same displayed-status rules as itemsForStatus, applied to items already loaded (member lists). */
function matchesStatus(item, status, today) {
    const derived = deriveInvoiceStatus(item, today);
    if (status === 'OVERDUE') return derived.isOverdue;
    if (status === 'UNPAID') return item.baseStatus === 'ISSUED' && derived.outstandingPaise > 0;
    return derived.displayedStatus === status;
}

const EMPTY_SUMMARY = { totalOutstanding: 0, totalReceived: 0 };

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
 *
 * Member (not admin) scope: only invoices whose orderId is an order their linked Worker is assigned
 * to; invoices with no orderId never. Always unpaginated (limit/nextToken ignored, nextToken null).
 * ?orderId= of an order that is not visible gives 200 { items: [], nextToken: null, summary: 0/0 };
 * ?billedToId= keeps only visible invoices and sums only those. No linked Worker: every list is [].
 * Every item's billedTo.canOpen: admin true; member true only when the billed-to party is one of
 * their visible clients (common/scope visibleClients), else false (name only).
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const query = event.queryStringParameters || {};
    const given = FILTERS.filter((f) => query[f] !== undefined);
    if (given.length > 1) {
        throw errors.validationFailed(
            given.map((f) => ({ field: f, message: 'Use only one filter per request' })),
            'Use only one filter per request'
        );
    }

    const member = scope.isMember(user);

    const idFilter = given.find((f) => ID_FILTER_INDEX[f]);
    if (idFilter) {
        const id = query[idFilter];
        if (!validators.isUuidV4(id)) {
            throw errors.validationFailed([{ field: idFilter, message: `${idFilter} must be a lowercase UUID v4` }]);
        }
        let visible = null;
        if (member) {
            if (idFilter === 'orderId' && !(await scope.isOrderVisible(user, id))) {
                return http.ok({ items: [], nextToken: null, summary: { ...EMPTY_SUMMARY } });
            }
            visible = await scope.visibleOrderIds(user);
            // The base-table check above wins over a byWorker index that has not caught up yet.
            if (idFilter === 'orderId') visible.add(id);
            if (visible.size === 0) return http.ok({ items: [], nextToken: null, summary: { ...EMPTY_SUMMARY } });
        }
        const found = await database.queryAll({
            TableName: process.env.INVOICES_TABLE,
            IndexName: ID_FILTER_INDEX[idFilter],
            KeyConditionExpression: '#key = :id',
            ExpressionAttributeNames: { '#key': idFilter },
            ExpressionAttributeValues: { ':id': id },
            ScanIndexForward: false,
        });
        const items = visible ? found.filter((i) => i.orderId && visible.has(i.orderId)) : found;
        const summary = summarize(items, validators.todayIst());
        const clients = member ? await memberClients(user, visible) : null;
        return http.ok({ items: await enrichInvoices(items, clients), nextToken: null, summary });
    }

    if (query.status !== undefined) {
        if (!DISPLAYED_STATUS_FILTERS.includes(query.status)) {
            throw errors.validationFailed([
                { field: 'status', message: `Status must be one of ${DISPLAYED_STATUS_FILTERS.join(', ')}` },
            ]);
        }
        if (member) {
            const today = validators.todayIst();
            const visible = await scope.visibleOrderIds(user);
            const items = (await visibleInvoiceItems(user, visible)).filter((i) =>
                matchesStatus(i, query.status, today)
            );
            return http.ok({ items: await enrichInvoices(items, await memberClients(user, visible)), nextToken: null });
        }
        const items = (await itemsForStatus(query.status)).sort(byNewest);
        return http.ok({ items: await enrichInvoices(items), nextToken: null });
    }

    if (member) {
        const visible = await scope.visibleOrderIds(user);
        const items = await visibleInvoiceItems(user, visible);
        return http.ok({ items: await enrichInvoices(items, await memberClients(user, visible)), nextToken: null });
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
