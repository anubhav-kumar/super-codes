'use strict';

const { UpdateCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const s3 = require('common/s3');
const {
    STATUS,
    assertOrderInScope,
    memberAssignmentCheck,
    getFileItem,
    toFile,
    cancellationReasons,
} = require('../utils/files');

/**
 * POST /files/orders/{orderId}/{fileId}/complete   (F-62)
 * 200 { file (PRESENT) }   also when already PRESENT (idempotent)
 * 404 NOT_FOUND            scope; unknown id; REMOVED; PENDING of another uploader
 * 409 UPLOAD_INCOMPLETE    no object in storage, or its size differs from sizeBytes
 *
 * HeadObject(key), then PENDING -> PRESENT (condition: still PENDING and uploaded by the caller)
 * [+ member ConditionCheck on their own assignment]. A failed or abandoned upload never becomes
 * PRESENT, so it is never listed.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const params = event.pathParameters || {};
    const { orderId, fileId } = params;
    if (!validators.isUuidV4(fileId)) throw errors.notFound();
    await assertOrderInScope(user, orderId, { consistent: true });

    const item = await getFileItem(orderId, fileId, { consistent: true });
    const outcome = await settle(item, user);
    if (outcome) return outcome;

    const head = await s3.headFile(item.key);
    if (!head || head.size !== item.sizeBytes) {
        throw errors.conflict('UPLOAD_INCOMPLETE', 'The upload did not finish. Try again.');
    }

    const now = new Date().toISOString();
    const update = {
        TableName: process.env.FILES_TABLE,
        Key: { orderId, id: fileId },
        UpdateExpression: 'SET #status = :present, uploadedAt = :now, updatedAt = :now',
        ConditionExpression: '#status = :pending AND uploadedByUserId = :me',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':present': STATUS.PRESENT, ':pending': STATUS.PENDING, ':now': now, ':me': user.userId },
    };
    const check = memberAssignmentCheck(user, orderId);

    try {
        if (check) await database.doc.send(new TransactWriteCommand({ TransactItems: [{ Update: update }, check] }));
        else await database.doc.send(new UpdateCommand(update));
    } catch (err) {
        const reasons = cancellationReasons(err);
        if (reasons && reasons[1] && reasons[1].Code === 'ConditionalCheckFailed') throw errors.notFound();
        const updateFailed = err.name === 'ConditionalCheckFailedException' || (reasons && reasons[0] && reasons[0].Code === 'ConditionalCheckFailed');
        if (updateFailed) {
            const raced = await getFileItem(orderId, fileId, { consistent: true });
            const again = await settle(raced, user);
            if (again) return again;
            throw errors.notFound();
        }
        throw err;
    }

    logger.info('file upload completed', { orderId, fileId });
    return http.ok({ file: toFile({ ...item, status: STATUS.PRESENT, uploadedAt: now, updatedAt: now }, user) });
});

/**
 * Decides the request without touching storage when it can: 404 for missing / REMOVED / someone
 * else's PENDING, 200 for PRESENT (idempotent). Returns null when the caller's PENDING file must
 * be checked and completed.
 */
async function settle(item, user) {
    if (!item || item.status === STATUS.REMOVED) throw errors.notFound();
    if (item.status === STATUS.PRESENT) return http.ok({ file: toFile(item, user) });
    if (item.uploadedByUserId !== user.userId) throw errors.notFound();
    return null;
}
