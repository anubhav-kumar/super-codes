'use strict';

const { middleware, database, http } = require('common');
const { STATUS, assertOrderInScope, toFile } = require('../utils/files');

/**
 * GET /files/orders/{orderId}   (F-62)
 * 200 { items: [File], nextToken: null }   PRESENT files only, newest uploadedAt first, unpaginated
 * 404 NOT_FOUND                            scope
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const orderId = event.pathParameters && event.pathParameters.orderId;
    await assertOrderInScope(user, orderId);

    const items = await database.queryAll({
        TableName: process.env.FILES_TABLE,
        KeyConditionExpression: 'orderId = :orderId',
        ExpressionAttributeValues: { ':orderId': orderId },
    });

    const present = items
        .filter((f) => f.status === STATUS.PRESENT)
        .sort((a, b) => (a.uploadedAt === b.uploadedAt ? (a.id < b.id ? 1 : -1) : a.uploadedAt < b.uploadedAt ? 1 : -1));

    return http.ok({ items: present.map((f) => toFile(f, user)), nextToken: null });
});
