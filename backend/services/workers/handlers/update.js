'use strict';

const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const { parseWorker } = require('../validators/worker');
const { toItem, toWorker } = require('../models/worker');

/**
 * PUT /workers/{id}
 * Full replace of the editable fields; omitted or null optional fields are cleared.
 * 200 Worker, 400 VALIDATION_FAILED, 404 NOT_FOUND
 * Setting INACTIVE never touches order assignments.
 * Admin only: a member gets 404 NOT_FOUND.
 */
module.exports.handler = middleware.withHandler(async ({ event, body }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const fields = parseWorker(body, { isCreate: false });

    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.WORKERS_TABLE, Key: { id }, ConsistentRead: true })
    );
    if (!res.Item) throw errors.notFound();

    const item = toItem(id, fields, { createdAt: res.Item.createdAt, updatedAt: new Date().toISOString() });
    try {
        await database.doc.send(
            new PutCommand({
                TableName: process.env.WORKERS_TABLE,
                Item: item,
                ConditionExpression: 'attribute_exists(id)',
            })
        );
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') throw errors.notFound();
        throw err;
    }

    logger.info('worker updated', { workerId: id });
    return http.ok(toWorker(item));
}, { adminOnly: true });
