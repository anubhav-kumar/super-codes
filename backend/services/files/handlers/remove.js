'use strict';

const { UpdateCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const scope = require('common/scope');
const s3 = require('common/s3');
const {
    STATUS,
    assertOrderInScope,
    memberAssignmentCheck,
    getFileItem,
    cancellationReasons,
} = require('../utils/files');

/**
 * DELETE /files/orders/{orderId}/{fileId}   (F-64, FR2 decision 13)
 * 204 (empty)          also when already REMOVED (idempotent)
 * 403 FILE_NOT_YOURS   member and not the uploader
 * 404 NOT_FOUND        scope; unknown id
 *
 * The uploader or any admin may remove a file. The record is kept as REMOVED with who/when (for
 * the timeline) and the S3 object is deleted, so no link can be issued again. A failed
 * DeleteObject after the record update is logged (ids only) and not shown to the user; a repeat
 * DELETE on a REMOVED record tries the object delete again (DeleteObject is idempotent).
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const params = event.pathParameters || {};
    const { orderId, fileId } = params;
    if (!validators.isUuidV4(fileId)) throw errors.notFound();
    await assertOrderInScope(user, orderId, { consistent: true });

    const item = await getFileItem(orderId, fileId, { consistent: true });
    const outcome = await settle(item, user, orderId, fileId);
    if (outcome) return outcome;

    const isAdmin = !scope.isMember(user);
    const now = new Date().toISOString();
    const update = {
        TableName: process.env.FILES_TABLE,
        Key: { orderId, id: fileId },
        UpdateExpression:
            'SET #status = :removed, removedAt = :now, removedByUserId = :me, removedByName = :name, updatedAt = :now',
        ConditionExpression: isAdmin
            ? '#status IN (:pending, :present)'
            : '#status IN (:pending, :present) AND uploadedByUserId = :me',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':removed': STATUS.REMOVED,
            ':pending': STATUS.PENDING,
            ':present': STATUS.PRESENT,
            ':now': now,
            ':me': user.userId,
            ':name': user.name,
        },
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
            const again = await settle(raced, user, orderId, fileId);
            if (again) return again;
            throw errors.notFound();
        }
        throw err;
    }

    logger.info('file removed', { orderId, fileId });
    await deleteObject(item.key, orderId, fileId);
    return http.noContent();
});

/**
 * Decides the request without writing when it can: 404 for a missing record, 204 for one already
 * REMOVED (after retrying the object delete), 403 for a member who is not the uploader. Returns
 * null when the record must be marked REMOVED.
 */
async function settle(item, user, orderId, fileId) {
    if (!item) throw errors.notFound();
    if (item.status === STATUS.REMOVED) {
        await deleteObject(item.key, orderId, fileId);
        return http.noContent();
    }
    if (scope.isMember(user) && item.uploadedByUserId !== user.userId) {
        throw errors.forbidden('FILE_NOT_YOURS', 'You can only remove files you uploaded');
    }
    return null;
}

/** Best effort: the REMOVED record already blocks new links. Never logs the key or file name. */
async function deleteObject(key, orderId, fileId) {
    if (!key) return;
    try {
        await s3.deleteFile(key);
    } catch (err) {
        logger.error('file object delete failed', { orderId, fileId, errorName: err && err.name });
    }
}
