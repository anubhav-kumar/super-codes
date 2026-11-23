'use strict';

/**
 * Session helpers shared by POST /auth/password (F-47) and the P-25 user-management routes.
 */

const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { database } = require('common');

const SESSIONS_BY_USER_ID = 'byUserId';

/**
 * Deletes every session of a user (Sessions GSI byUserId), except `exceptTokenHash` when given.
 * The GSI is eventually consistent: a session written a moment ago can be missed. Returns the
 * number of sessions deleted.
 */
async function revokeSessions(userId, { exceptTokenHash } = {}) {
    const items = await database.queryAll({
        TableName: process.env.SESSIONS_TABLE,
        IndexName: SESSIONS_BY_USER_ID,
        KeyConditionExpression: 'userId = :id',
        ExpressionAttributeValues: { ':id': userId },
        ProjectionExpression: 'tokenHash',
    });
    const hashes = [...new Set(items.map((item) => item.tokenHash))].filter((h) => h && h !== exceptTokenHash);
    for (let i = 0; i < hashes.length; i += 16) {
        await Promise.all(
            hashes.slice(i, i + 16).map((tokenHash) =>
                database.doc.send(new DeleteCommand({ TableName: process.env.SESSIONS_TABLE, Key: { tokenHash } }))
            )
        );
    }
    return hashes.length;
}

module.exports = { revokeSessions };
