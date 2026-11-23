'use strict';

const { PutCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const s3 = require('common/s3');
const { parseUpload } = require('../validators/upload');
const {
    STATUS,
    NO_STORE,
    assertOrderInScope,
    memberAssignmentCheck,
    getFileItem,
    toFile,
    cancellationReasons,
} = require('../utils/files');

/**
 * POST /files/orders/{orderId}/uploads   (F-62)
 * Body { id, fileName, size }.
 * 201 { file (PENDING), uploadUrl, uploadHeaders, uploadExpiresAt }   new PENDING record, PUT URL 15 min
 * 200 same body when this id is already PENDING for the caller (fresh URL for the stored key), or
 *     { file (PRESENT), uploadUrl: null, uploadHeaders: null, uploadExpiresAt: null } when PRESENT
 * 400 VALIDATION_FAILED, 404 NOT_FOUND (scope), 409 ID_CONFLICT (id used by another uploader / REMOVED)
 * Cache-Control: no-store.
 *
 * The server chooses the key (files/<orderId>/<random8>-<name>) and binds it to the record; the
 * client never sends or receives it. Never logs the key or the file name.
 */
module.exports.handler = middleware.withHandler(async ({ event, body, user }) => {
    const orderId = event.pathParameters && event.pathParameters.orderId;
    if (!validators.isUuidV4(orderId)) throw errors.notFound();
    const fields = parseUpload(body);
    await assertOrderInScope(user, orderId, { consistent: true });

    const existing = await getFileItem(orderId, fields.id, { consistent: true });
    if (existing) return respondToExisting(existing, user);

    const now = new Date().toISOString();
    const item = {
        orderId,
        id: fields.id,
        key: s3.buildFileKey(`files/${orderId}`, fields.fileName),
        fileName: fields.fileName,
        contentType: fields.contentType,
        sizeBytes: fields.size,
        status: STATUS.PENDING,
        uploadedByUserId: user.userId,
        uploadedByName: user.name,
        createdAt: now,
        updatedAt: now,
    };
    const put = { TableName: process.env.FILES_TABLE, Item: item, ConditionExpression: 'attribute_not_exists(id)' };
    const check = memberAssignmentCheck(user, orderId);

    try {
        if (check) await database.doc.send(new TransactWriteCommand({ TransactItems: [{ Put: put }, check] }));
        else await database.doc.send(new PutCommand(put));
    } catch (err) {
        const reasons = cancellationReasons(err);
        const putFailed = err.name === 'ConditionalCheckFailedException' || (reasons && reasons[0] && reasons[0].Code === 'ConditionalCheckFailed');
        if (putFailed) {
            const raced = await getFileItem(orderId, fields.id, { consistent: true });
            if (raced) return respondToExisting(raced, user);
        }
        if (reasons && reasons[1] && reasons[1].Code === 'ConditionalCheckFailed') throw errors.notFound();
        throw err;
    }

    const upload = await s3.createUploadUrl({ key: item.key, contentType: item.contentType, size: item.sizeBytes });
    logger.info('file upload started', { orderId, fileId: item.id, sizeBytes: item.sizeBytes });
    return http.created(
        { file: toFile(item, user), uploadUrl: upload.uploadUrl, uploadHeaders: upload.uploadHeaders, uploadExpiresAt: upload.expiresAt },
        NO_STORE
    );
});

async function respondToExisting(existing, user) {
    if (existing.uploadedByUserId !== user.userId || existing.status === STATUS.REMOVED) {
        throw errors.conflict('ID_CONFLICT', 'This file id is already in use');
    }
    if (existing.status === STATUS.PRESENT) {
        return http.ok({ file: toFile(existing, user), uploadUrl: null, uploadHeaders: null, uploadExpiresAt: null }, NO_STORE);
    }
    const upload = await s3.createUploadUrl({ key: existing.key, contentType: existing.contentType, size: existing.sizeBytes });
    logger.info('file upload url reissued', { orderId: existing.orderId, fileId: existing.id });
    return http.ok(
        { file: toFile(existing, user), uploadUrl: upload.uploadUrl, uploadHeaders: upload.uploadHeaders, uploadExpiresAt: upload.expiresAt },
        NO_STORE
    );
}
