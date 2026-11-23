'use strict';

const { middleware, database, http } = require('common');
const timeline = require('common/timeline');
const { loadOrderForScope, toEntry } = require('../utils/entries');

/**
 * GET /timeline/orders/{orderId}
 * 200 { items: [Entry], nextToken: null, latestActivityAt: ISO | null }
 *     every entry of the order (comments and events), oldest first, unpaginated
 * 404 NOT_FOUND   id not a UUID v4, unknown order, or member whose Worker is not assigned
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const orderId = event.pathParameters && event.pathParameters.orderId;
    await loadOrderForScope(user, orderId);

    const items = await database.queryAll({
        TableName: process.env.TIMELINE_TABLE,
        IndexName: timeline.BY_TIME,
        KeyConditionExpression: '#orderId = :orderId',
        ExpressionAttributeNames: { '#orderId': 'orderId' },
        ExpressionAttributeValues: { ':orderId': orderId },
        ScanIndexForward: true,
    });

    const entries = items.map((item) => toEntry(item, user));
    const latestActivityAt = entries.length ? entries[entries.length - 1].createdAt : null;
    return http.ok({ items: entries, nextToken: null, latestActivityAt });
});
