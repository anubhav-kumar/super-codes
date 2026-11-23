'use strict';

const { middleware, errors, validators, http, logger } = require('common');
const s3 = require('common/s3');
const { STATUS, NO_STORE, assertOrderInScope, getFileItem } = require('../utils/files');

/**
 * GET /files/orders/{orderId}/{fileId}/url   (F-63)
 * 200 { url, expiresAt }   pre-signed S3 GET, valid 5 minutes; header Cache-Control: no-store
 * 404 NOT_FOUND            scope (incl. a member unassigned since); unknown id; PENDING; REMOVED
 *
 * Scope is checked on every call with strongly consistent reads, so an unassigned member gets 404
 * at once. PDF and images open inline, other types download, with the original file name
 * (common/s3.createDownloadUrl). Never log the URL, the key or the file name.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const params = event.pathParameters || {};
    const { orderId, fileId } = params;
    if (!validators.isUuidV4(fileId)) throw errors.notFound();
    await assertOrderInScope(user, orderId, { consistent: true });

    const item = await getFileItem(orderId, fileId, { consistent: true });
    if (!item || item.status !== STATUS.PRESENT) throw errors.notFound();

    const { url, expiresAt } = await s3.createDownloadUrl({
        key: item.key,
        fileName: item.fileName,
        contentType: item.contentType,
    });

    logger.info('file link issued', { orderId, fileId });
    return http.ok({ url, expiresAt }, NO_STORE);
});
