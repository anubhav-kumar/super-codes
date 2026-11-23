'use strict';

const { GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http } = require('common');
const { STATUSES } = require('../validators/worker');
const { ENTITY, toWorker } = require('../models/worker');
const { openOrderCounts } = require('../utils/openOrders');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function parseLimit(raw) {
    if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 1 && n <= MAX_LIMIT ? n : null;
}

/** Worker items -> Worker list items (Worker object + openOrderCount). No order reads for an empty page. */
async function toListItems(items) {
    if (items.length === 0) return [];
    const counts = await openOrderCounts();
    return items.map((item) => ({ ...toWorker(item), openOrderCount: counts.get(item.id) || 0 }));
}

/**
 * GET /workers?limit=&nextToken=     all workers by name A-Z, paginated
 * GET /workers?status=ACTIVE|INACTIVE  filtered by status, by name A-Z, unpaginated
 * 200 { items: [Worker list item], nextToken: string | null }, 400 VALIDATION_FAILED
 * Worker list item = Worker + openOrderCount (open orders the worker is assigned to, primary or not).
 * Member: only their own linked Worker (when it matches ?status), unpaginated; [] with no link.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const query = event.queryStringParameters || {};
    const table = process.env.WORKERS_TABLE;

    if (query.status !== undefined && !STATUSES.includes(query.status)) {
        throw errors.validationFailed([{ field: 'status', message: `Status must be one of ${STATUSES.join(', ')}` }]);
    }

    if (!user.isAdmin) {
        if (!user.workerId) return http.ok({ items: [], nextToken: null });
        const res = await database.doc.send(new GetCommand({ TableName: table, Key: { id: user.workerId } }));
        const own = res.Item && (query.status === undefined || res.Item.status === query.status) ? [res.Item] : [];
        return http.ok({ items: await toListItems(own), nextToken: null });
    }

    if (query.status !== undefined) {
        const items = await database.queryAll({
            TableName: table,
            IndexName: 'byStatus',
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': query.status },
            ScanIndexForward: true,
        });
        return http.ok({ items: await toListItems(items), nextToken: null });
    }

    const limit = parseLimit(query.limit);
    if (limit === null) {
        throw errors.validationFailed([{ field: 'limit', message: `limit must be an integer from 1 to ${MAX_LIMIT}` }]);
    }
    const startKey = database.decodeToken(query.nextToken);

    const res = await database.doc.send(
        new QueryCommand({
            TableName: table,
            IndexName: 'byName',
            KeyConditionExpression: '#entity = :entity',
            ExpressionAttributeNames: { '#entity': 'entity' },
            ExpressionAttributeValues: { ':entity': ENTITY },
            ScanIndexForward: true,
            Limit: limit,
            ExclusiveStartKey: startKey,
        })
    );
    return http.ok({ items: await toListItems(res.Items || []), nextToken: database.encodeToken(res.LastEvaluatedKey) });
});
