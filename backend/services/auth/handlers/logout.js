'use strict';

const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, http, logger } = require('common');

/**
 * POST /auth/logout  (no body; allowed while a temporary password is active)
 * 204 session deleted
 * 401 UNAUTHORIZED when the token is missing or already invalid (from withHandler)
 */
module.exports.handler = middleware.withHandler(async ({ session }) => {
    await database.doc.send(
        new DeleteCommand({ TableName: process.env.SESSIONS_TABLE, Key: { tokenHash: session.tokenHash } })
    );
    logger.info('signed out', { userId: session.userId });
    return http.noContent();
}, { allowTemporaryPassword: true });
