'use strict';

const { GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const scope = require('common/scope');
const timeline = require('common/timeline');
const { parseComment } = require('../../validators/comment');
const { loadOrderForScope, toEntry } = require('../../utils/entries');

// Bounded loop: one retry after a status race, plus re-reads after a comment id race.
const MAX_ATTEMPTS = 3;

function orderSummary(order) {
    return { id: order.id, status: order.status, updatedAt: order.updatedAt };
}

async function getEntry(orderId, id) {
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.TIMELINE_TABLE, Key: { orderId, id }, ConsistentRead: true })
    );
    return res.Item || null;
}

function reasonCode(reasons, index) {
    return index >= 0 && reasons[index] ? reasons[index].Code : undefined;
}

/**
 * POST /timeline/orders/{orderId}/comments
 * Body { id: uuid v4, text: 1-5,000 after trim, status?: NEW|ACCEPTED|IN_PROGRESS|COMPLETED|ON_HOLD|CANCELLED|null }
 * 201 { comment: Entry, statusEvent: Entry | null, order: { id, status, updatedAt } }
 * 200 same shape with statusEvent null, when this caller already posted a comment with this id on
 *     this order (idempotent retry; nothing written)
 * 400 VALIDATION_FAILED   id | text | status (incl. "The order already has this status")
 * 404 NOT_FOUND           scope (unknown order, member not assigned)
 * 409 ID_CONFLICT         the id is already used by another entry
 * 409 ORDER_CHANGED       status given and the order status changed meanwhile (after one retry)
 *
 * One TransactWriteItems: Put comment (attribute_not_exists(id)) + with status: Update Orders
 * status/updatedAt (condition status = the status just read) and Put a STATUS_CHANGED event
 * (details.commentId = comment id) + member: ConditionCheck on their own assignment (last).
 * The comment text is never logged.
 */
module.exports.handler = middleware.withHandler(async ({ event, body, user }) => {
    const orderId = event.pathParameters && event.pathParameters.orderId;
    if (!validators.isUuidV4(orderId)) throw errors.notFound();

    const input = parseComment(body, { isCreate: true });
    const member = scope.isMember(user);
    let statusRetried = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const order = await loadOrderForScope(user, orderId, { consistent: true });

        const existing = await getEntry(orderId, input.id);
        if (existing) {
            if (existing.kind === 'COMMENT' && existing.actorUserId === user.userId) {
                return http.ok({ comment: toEntry(existing, user), statusEvent: null, order: orderSummary(order) });
            }
            throw errors.conflict('ID_CONFLICT', 'Try again', [{ field: 'id', message: 'Try again' }]);
        }

        if (input.status !== null && input.status === order.status) {
            throw errors.validationFailed([{ field: 'status', message: 'The order already has this status' }]);
        }

        const now = new Date().toISOString();
        const comment = {
            orderId,
            id: input.id,
            kind: 'COMMENT',
            createdAt: now,
            updatedAt: now,
            timeKey: timeline.timeKey(now, input.id),
            actorUserId: user.userId,
            actorName: user.name,
            text: input.text,
        };

        const transactItems = [
            {
                Put: {
                    TableName: process.env.TIMELINE_TABLE,
                    Item: comment,
                    ConditionExpression: 'attribute_not_exists(id)',
                },
            },
        ];

        let statusEvent = null;
        let orderIndex = -1;
        if (input.status !== null) {
            comment.statusChange = { from: order.status, to: input.status };
            statusEvent = timeline.buildEvent({
                orderId,
                type: 'STATUS_CHANGED',
                user,
                details: { from: order.status, to: input.status, commentId: input.id },
                at: now,
            });
            // Same createdAt as the comment; the timeKey extends the comment's so the event always sorts
            // right after its comment in the byTime index.
            statusEvent.timeKey = timeline.timeKey(now, `${input.id}#${statusEvent.id}`);

            orderIndex = transactItems.length;
            transactItems.push({
                Update: {
                    TableName: process.env.ORDERS_TABLE,
                    Key: { id: orderId },
                    UpdateExpression: 'SET #status = :to, #updatedAt = :now',
                    ConditionExpression: 'attribute_exists(#id) AND #status = :from',
                    ExpressionAttributeNames: { '#id': 'id', '#status': 'status', '#updatedAt': 'updatedAt' },
                    ExpressionAttributeValues: { ':to': input.status, ':from': order.status, ':now': now },
                },
            });
            transactItems.push(timeline.eventPut(statusEvent));
        }

        let memberIndex = -1;
        if (member) {
            // The member must still be assigned when the write lands (an admin may unassign them meanwhile).
            memberIndex = transactItems.length;
            transactItems.push({
                ConditionCheck: {
                    TableName: process.env.ASSIGNMENTS_TABLE,
                    Key: { orderId, workerId: scope.memberWorkerId(user) },
                    ConditionExpression: 'attribute_exists(orderId)',
                },
            });
        }

        try {
            await database.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
        } catch (err) {
            if (!err || err.name !== 'TransactionCanceledException') throw err;
            const reasons = err.CancellationReasons || [];
            if (reasonCode(reasons, memberIndex) === 'ConditionalCheckFailed') throw errors.notFound();
            const orderCode = reasonCode(reasons, orderIndex);
            if (orderCode === 'ConditionalCheckFailed' || orderCode === 'TransactionConflict') {
                if (statusRetried) {
                    throw errors.conflict('ORDER_CHANGED', 'This order was just changed. Refresh and try again.');
                }
                statusRetried = true;
                continue;
            }
            // The comment id was taken meanwhile: the next attempt's idempotency read decides 200 or 409.
            if (reasonCode(reasons, 0) === 'ConditionalCheckFailed') continue;
            throw err;
        }

        const updatedOrder = statusEvent ? { id: orderId, status: input.status, updatedAt: now } : orderSummary(order);
        logger.info('comment created', {
            orderId,
            commentId: input.id,
            statusChanged: Boolean(statusEvent),
            statusRetried,
        });
        return http.created({
            comment: toEntry(comment, user),
            statusEvent: statusEvent ? toEntry(statusEvent, user) : null,
            order: updatedOrder,
        });
    }

    throw errors.conflict('ORDER_CHANGED', 'This order was just changed. Refresh and try again.');
});
