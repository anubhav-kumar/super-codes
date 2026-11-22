'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http } = require('common');
const { STATUSES } = require('../validators/order');
const { ENTITY } = require('../models/order');
const { enrichOrders } = require('../utils/enrich');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const FILTERS = ['status', 'clientId', 'receivedFromId', 'workerId'];
const ID_FILTER_INDEX = { clientId: 'byClient', receivedFromId: 'byReceivedFrom' };

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

/** Orders the worker has an assignment on, newest first, each with that assignment. */
async function ordersOfWorker(workerId) {
    const assignments = await database.queryAll({
        TableName: process.env.ASSIGNMENTS_TABLE,
        IndexName: 'byWorker',
        KeyConditionExpression: '#workerId = :workerId',
        ExpressionAttributeNames: { '#workerId': 'workerId' },
        ExpressionAttributeValues: { ':workerId': workerId },
    });
    if (assignments.length === 0) return [];
    const byOrder = new Map(assignments.map((a) => [a.orderId, a]));
    const orders = await database.batchGetByIds(process.env.ORDERS_TABLE, 'id', [...byOrder.keys()]);
    const items = [...orders.values()].sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
    const enriched = await enrichOrders(items);
    return enriched.map((order) => {
        const a = byOrder.get(order.id);
        return { ...order, assignment: { isPrimary: a.isPrimary === true, assignedDate: a.assignedDate } };
    });
}

/**
 * GET /orders?limit=&nextToken=   all orders, paginated
 * GET /orders?status=<STATUS>     filtered by status, unpaginated
 * GET /orders?clientId=<uuid>     orders where this person/company is the client, unpaginated
 * GET /orders?receivedFromId=<uuid>  orders this person requested, unpaginated
 * GET /orders?workerId=<uuid>     orders this worker is assigned to (primary or not, any status),
 *                                 unpaginated; each item also carries assignment { isPrimary, assignedDate }
 * Only one filter per request.
 * Sorted newest order date first, then highest order number first.
 * 200 { items: [Order], nextToken: string | null }, 400 VALIDATION_FAILED
 * List items carry primaryOwner but not assignments.
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const query = event.queryStringParameters || {};
    const table = process.env.ORDERS_TABLE;
    const given = FILTERS.filter((f) => query[f] !== undefined);
    if (given.length > 1) {
        throw errors.validationFailed(
            given.map((f) => ({ field: f, message: 'Use only one filter per request' })),
            'Use only one filter per request'
        );
    }

    if (query.workerId !== undefined) {
        const workerId = query.workerId;
        if (!validators.isUuidV4(workerId)) {
            throw errors.validationFailed([{ field: 'workerId', message: 'workerId must be a lowercase UUID v4' }]);
        }
        return http.ok({ items: await ordersOfWorker(workerId), nextToken: null });
    }

    const idFilter = given.find((f) => ID_FILTER_INDEX[f]);
    if (idFilter) {
        const id = query[idFilter];
        if (!validators.isUuidV4(id)) {
            throw errors.validationFailed([{ field: idFilter, message: `${idFilter} must be a lowercase UUID v4` }]);
        }
        const items = await database.queryAll({
            TableName: table,
            IndexName: ID_FILTER_INDEX[idFilter],
            KeyConditionExpression: '#key = :id',
            ExpressionAttributeNames: { '#key': idFilter },
            ExpressionAttributeValues: { ':id': id },
            ScanIndexForward: false,
        });
        return http.ok({ items: await enrichOrders(items), nextToken: null });
    }

    if (query.status !== undefined) {
        if (!STATUSES.includes(query.status)) {
            throw errors.validationFailed([{ field: 'status', message: `Status must be one of ${STATUSES.join(', ')}` }]);
        }
        const items = await database.queryAll({
            TableName: table,
            IndexName: 'byStatus',
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': query.status },
            ScanIndexForward: false,
        });
        return http.ok({ items: await enrichOrders(items), nextToken: null });
    }

    const limit = parseLimit(query.limit);
    if (limit === null) {
        throw errors.validationFailed([{ field: 'limit', message: `limit must be an integer from 1 to ${MAX_LIMIT}` }]);
    }
    const startKey = database.decodeToken(query.nextToken);

    const res = await sendListQuery(
        new QueryCommand({
            TableName: table,
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
        items: await enrichOrders(res.Items || []),
        nextToken: database.encodeToken(res.LastEvaluatedKey),
    });
});
