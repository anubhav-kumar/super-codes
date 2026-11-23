'use strict';

const { GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const scope = require('common/scope');
const { loadOrderForScope } = require('../../utils/entries');

function reasonCode(reasons, index) {
    return index >= 0 && reasons[index] ? reasons[index].Code : undefined;
}

/**
 * DELETE /timeline/orders/{orderId}/comments/{commentId}
 * 204 (empty)             also when the comment no longer exists (idempotent)
 * 403 NOT_COMMENT_AUTHOR  member deleting another user's comment
 * 404 NOT_FOUND           scope; id of an event
 *
 * Authors delete their own comments; admins delete any comment. Only the comment item is removed:
 * the order status and any STATUS_CHANGED event of a progress update stay.
 * Members: the delete and a ConditionCheck on their own assignment share one transaction.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const params = event.pathParameters || {};
    const { orderId, commentId } = params;
    if (!validators.isUuidV4(orderId) || !validators.isUuidV4(commentId)) throw errors.notFound();

    await loadOrderForScope(user, orderId, { consistent: true });
    const member = scope.isMember(user);

    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.TIMELINE_TABLE, Key: { orderId, id: commentId }, ConsistentRead: true })
    );
    const existing = res.Item;
    if (!existing) return http.noContent();
    if (existing.kind !== 'COMMENT') throw errors.notFound();
    if (member && existing.actorUserId !== user.userId) {
        throw errors.forbidden('NOT_COMMENT_AUTHOR', 'You can only change your own comments');
    }

    const names = { '#kind': 'kind' };
    const values = { ':comment': 'COMMENT' };
    let condition = '#kind = :comment';
    if (member) {
        names['#actorUserId'] = 'actorUserId';
        values[':me'] = user.userId;
        condition += ' AND #actorUserId = :me';
    }
    const transactItems = [
        {
            Delete: {
                TableName: process.env.TIMELINE_TABLE,
                Key: { orderId, id: commentId },
                ConditionExpression: condition,
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
            },
        },
    ];
    let memberIndex = -1;
    if (member) {
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
        // Kind and author never change, so a failed condition means it was deleted meanwhile.
        if (reasonCode(reasons, 0) === 'ConditionalCheckFailed') return http.noContent();
        throw err;
    }

    logger.info('comment deleted', { orderId, commentId, byAuthor: existing.actorUserId === user.userId });
    return http.noContent();
});
