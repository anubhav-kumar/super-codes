'use strict';

const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http } = require('common');
const { toWorker } = require('../models/worker');

/**
 * GET /workers/{id}
 * 200 Worker, 404 NOT_FOUND (also for an id that is not a UUID v4)
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const res = await database.doc.send(new GetCommand({ TableName: process.env.WORKERS_TABLE, Key: { id } }));
    if (!res.Item) throw errors.notFound();
    return http.ok(toWorker(res.Item));
});
