'use strict';

/**
 * Open order counts per worker, read from the orders service's tables (Query only, no Scan).
 * Open = NEW, ACCEPTED, IN_PROGRESS, ON_HOLD. Every assignment counts, primary or not.
 * A worker has at most one assignment per order (key orderId, workerId), so counting the
 * assignment items of open orders counts orders.
 */

const { database } = require('common');
const { mapLimit } = require('./mapLimit');

const OPEN_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'];
const CONCURRENCY = 16;

/** Returns Map workerId -> number of open orders the worker is assigned to. */
async function openOrderCounts() {
    const byStatus = await Promise.all(
        OPEN_STATUSES.map((status) =>
            database.queryAll({
                TableName: process.env.ORDERS_TABLE,
                IndexName: 'byStatus',
                KeyConditionExpression: '#status = :status',
                ExpressionAttributeNames: { '#status': 'status', '#id': 'id' },
                ExpressionAttributeValues: { ':status': status },
                ProjectionExpression: '#id',
            })
        )
    );
    const orderIds = [...new Set(byStatus.flat().map((o) => o.id))];

    const assignmentLists = await mapLimit(orderIds, CONCURRENCY, (orderId) =>
        database.queryAll({
            TableName: process.env.ASSIGNMENTS_TABLE,
            KeyConditionExpression: '#orderId = :orderId',
            ExpressionAttributeNames: { '#orderId': 'orderId', '#workerId': 'workerId' },
            ExpressionAttributeValues: { ':orderId': orderId },
            ProjectionExpression: '#workerId',
        })
    );

    const counts = new Map();
    for (const list of assignmentLists) {
        for (const a of list) counts.set(a.workerId, (counts.get(a.workerId) || 0) + 1);
    }
    return counts;
}

module.exports = { OPEN_STATUSES, openOrderCounts };
