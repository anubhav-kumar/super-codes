'use strict';

const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { database, errors, validators } = require('common');
const scope = require('common/scope');

const STATUS = Object.freeze({ PENDING: 'PENDING', PRESENT: 'PRESENT', REMOVED: 'REMOVED' });

/** Response header for routes that issue a pre-signed URL: never cache them. */
const NO_STORE = Object.freeze({ 'Cache-Control': 'no-store' });

/**
 * Order scope for every files route. Path ids that are not UUID v4 -> 404.
 * Admin: the order must exist (GetItem Orders). Member: their Worker must be assigned
 * (common/scope), else 404. `consistent` reads strongly (use before a write).
 */
async function assertOrderInScope(user, orderId, { consistent = false } = {}) {
    if (!validators.isUuidV4(orderId)) throw errors.notFound();
    if (scope.isMember(user)) {
        if (!(await scope.isOrderVisible(user, orderId, { consistent }))) throw errors.notFound();
        return;
    }
    const res = await database.doc.send(
        new GetCommand({
            TableName: process.env.ORDERS_TABLE,
            Key: { id: orderId },
            ProjectionExpression: 'id',
            ConsistentRead: consistent,
        })
    );
    if (!res.Item) throw errors.notFound();
}

/**
 * TransactWriteItems entry that fails when the member is no longer assigned to the order, so a
 * member unassigned mid-request cannot write. Null for admins.
 */
function memberAssignmentCheck(user, orderId) {
    if (!scope.isMember(user)) return null;
    return {
        ConditionCheck: {
            TableName: process.env.ASSIGNMENTS_TABLE,
            Key: { orderId, workerId: scope.memberWorkerId(user) },
            ConditionExpression: 'attribute_exists(orderId)',
        },
    };
}

async function getFileItem(orderId, id, { consistent = false } = {}) {
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.FILES_TABLE, Key: { orderId, id }, ConsistentRead: consistent })
    );
    return res.Item || null;
}

/** API File shape. The S3 key is never returned. */
function toFile(item, user) {
    return {
        id: item.id,
        orderId: item.orderId,
        fileName: item.fileName,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        status: item.status,
        uploadedBy: { id: item.uploadedByUserId, name: item.uploadedByName },
        uploadedAt: item.uploadedAt || null,
        createdAt: item.createdAt,
        commentId: item.commentId || null,
        canRemove: Boolean(user && (user.isAdmin === true || item.uploadedByUserId === user.userId)),
    };
}

/** CancellationReasons of a TransactionCanceledException (by index), or null for other errors. */
function cancellationReasons(err) {
    return err && err.name === 'TransactionCanceledException' ? err.CancellationReasons || [] : null;
}

module.exports = { STATUS, NO_STORE, assertOrderInScope, memberAssignmentCheck, getFileItem, toFile, cancellationReasons };
