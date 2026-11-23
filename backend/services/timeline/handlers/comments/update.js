'use strict';

const { GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const scope = require('common/scope');
const { parseComment } = require('../../validators/comment');
const { loadOrderForScope, toEntry } = require('../../utils/entries');

async function getEntry(orderId, id) {
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.TIMELINE_TABLE, Key: { orderId, id }, ConsistentRead: true })
    );
    return res.Item || null;
}

function reasonCode(reasons, index) {
    return index >= 0 && reasons[index] ? reasons[index].Code : undefined;
}

function notAuthor() {
    return errors.forbidden('NOT_COMMENT_AUTHOR', 'You can only change your own comments');
}

/**
 * PUT /timeline/orders/{orderId}/comments/{commentId}
 * Body { text: 1-5,000 after trim } (any other key is ignored)
 * 200 { comment: Entry }   editedAt set; unchanged text: nothing written, editedAt unchanged
 * 400 VALIDATION_FAILED    text
 * 403 NOT_COMMENT_AUTHOR   caller is not the author (admins too: they edit only their own)
 * 404 NOT_FOUND            scope; unknown comment id; id of an event
 *
 * Writes only text, editedAt and updatedAt; never statusChange or the order status.
 * Members: the update and a ConditionCheck on their own assignment share one transaction.
 * The comment text is never logged.
 */
module.exports.handler = middleware.withHandler(async ({ event, body, user }) => {
    const params = event.pathParameters || {};
    const { orderId, commentId } = params;
    if (!validators.isUuidV4(orderId) || !validators.isUuidV4(commentId)) throw errors.notFound();

    const input = parseComment(body, { isCreate: false });
    await loadOrderForScope(user, orderId, { consistent: true });

    const existing = await getEntry(orderId, commentId);
    if (!existing || existing.kind !== 'COMMENT') throw errors.notFound();
    if (existing.actorUserId !== user.userId) throw notAuthor();
    if (existing.text === input.text) return http.ok({ comment: toEntry(existing, user) });

    const now = new Date().toISOString();
    const transactItems = [
        {
            Update: {
                TableName: process.env.TIMELINE_TABLE,
                Key: { orderId, id: commentId },
                UpdateExpression: 'SET #text = :text, #editedAt = :now, #updatedAt = :now',
                ConditionExpression: '#kind = :comment AND #actorUserId = :me',
                ExpressionAttributeNames: {
                    '#text': 'text',
                    '#editedAt': 'editedAt',
                    '#updatedAt': 'updatedAt',
                    '#kind': 'kind',
                    '#actorUserId': 'actorUserId',
                },
                ExpressionAttributeValues: { ':text': input.text, ':now': now, ':comment': 'COMMENT', ':me': user.userId },
            },
        },
    ];
    let memberIndex = -1;
    if (scope.isMember(user)) {
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
        // Unassigned meanwhile, or the comment was deleted meanwhile (kind and author never change).
        if (reasonCode(reasons, memberIndex) === 'ConditionalCheckFailed') throw errors.notFound();
        if (reasonCode(reasons, 0) === 'ConditionalCheckFailed') throw errors.notFound();
        throw err;
    }

    logger.info('comment edited', { orderId, commentId });
    return http.ok({ comment: toEntry({ ...existing, text: input.text, editedAt: now, updatedAt: now }, user) });
});
