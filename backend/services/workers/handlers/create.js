'use strict';

const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, http, logger } = require('common');
const { parseWorker } = require('../validators/worker');
const { toItem, toWorker } = require('../models/worker');

async function getById(id) {
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.WORKERS_TABLE, Key: { id }, ConsistentRead: true })
    );
    return res.Item;
}

/**
 * POST /workers
 * 201 Worker, or 200 Worker when a worker with this id already exists (idempotent retry).
 * 400 VALIDATION_FAILED
 * Admin only: a member gets 404 NOT_FOUND.
 */
module.exports.handler = middleware.withHandler(async ({ body }) => {
    const fields = parseWorker(body, { isCreate: true });

    const existing = await getById(fields.id);
    if (existing) return http.ok(toWorker(existing));

    const now = new Date().toISOString();
    const item = toItem(fields.id, fields, { createdAt: now, updatedAt: now });
    try {
        await database.doc.send(
            new PutCommand({
                TableName: process.env.WORKERS_TABLE,
                Item: item,
                ConditionExpression: 'attribute_not_exists(id)',
            })
        );
    } catch (err) {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
        const raced = await getById(fields.id);
        if (!raced) throw err;
        return http.ok(toWorker(raced));
    }

    logger.info('worker created', { workerId: item.id });
    return http.created(toWorker(item));
}, { adminOnly: true });
