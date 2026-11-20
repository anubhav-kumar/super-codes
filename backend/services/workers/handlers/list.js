'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http } = require('common');
const { STATUSES } = require('../validators/worker');
const { ENTITY, toWorker } = require('../models/worker');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function parseLimit(raw) {
    if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 1 && n <= MAX_LIMIT ? n : null;
}

/**
 * GET /workers?limit=&nextToken=     all workers by name A-Z, paginated
 * GET /workers?status=ACTIVE|INACTIVE  filtered by status, by name A-Z, unpaginated
 * 200 { items: [Worker], nextToken: string | null }, 400 VALIDATION_FAILED
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const query = event.queryStringParameters || {};
    const table = process.env.WORKERS_TABLE;

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
            ScanIndexForward: true,
        });
        return http.ok({ items: items.map(toWorker), nextToken: null });
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
    return http.ok({ items: (res.Items || []).map(toWorker), nextToken: database.encodeToken(res.LastEvaluatedKey) });
});
