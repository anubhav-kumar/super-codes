'use strict';

const { GetCommand, UpdateCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http, logger } = require('common');
const { hashPassword, verifyPassword } = require('../utils/password');
const { sessionUser } = require('../utils/user');
const { revokeSessions } = require('../utils/sessions');

const SESSION_DAYS = 30;
const MIN_LENGTH = 8;
const MAX_LENGTH = 200;
const WRONG_CURRENT = { field: 'currentPassword', message: 'Current password is incorrect' };

function validate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const { currentPassword, newPassword } = body;
    const details = [];
    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        details.push({ field: 'currentPassword', message: 'Current password is required' });
    } else if (currentPassword.length > MAX_LENGTH) {
        details.push({ field: 'currentPassword', message: `Password must be at most ${MAX_LENGTH} characters` });
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_LENGTH) {
        details.push({ field: 'newPassword', message: `Password must be at least ${MIN_LENGTH} characters` });
    } else if (newPassword.length > MAX_LENGTH) {
        details.push({ field: 'newPassword', message: `Password must be at most ${MAX_LENGTH} characters` });
    }
    if (details.length) throw errors.validationFailed(details);
    return { currentPassword, newPassword };
}

/**
 * Sets the caller's own session expiry. A session deleted meanwhile (sign-out elsewhere) gives
 * 401 UNAUTHORIZED: sign in again.
 */
async function extendOwnSession(tokenHash, expires) {
    try {
        await database.doc.send(
            new UpdateCommand({
                TableName: process.env.SESSIONS_TABLE,
                Key: { tokenHash },
                UpdateExpression: 'SET expiresAt = :exp, #ttl = :ttl',
                ConditionExpression: 'attribute_exists(tokenHash)',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: {
                    ':exp': expires.toISOString(),
                    ':ttl': Math.floor(expires.getTime() / 1000),
                },
            })
        );
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') throw errors.unauthorized();
        throw err;
    }
}

/**
 * POST /auth/password  (allowed while a temporary password is active; this is also the forced
 * "Set a new password" route, where currentPassword is the temporary password)
 * Body { currentPassword, newPassword }
 * 200 { user: session user object (mustChangePassword false), expiresAt }
 *   Sets the new password, clears the temporary-password state, sets sessionsValidAfter = now (every
 *   other session of the user stops working at once; their items are then deleted as cleanup) and
 *   extends this session to now + 30 days. This session's createdAt is re-stamped to the same time in
 *   the same transaction, so it stays valid.
 * 400 VALIDATION_FAILED currentPassword "Current password is incorrect" (400, not 401, so the app
 *   does not treat it as signed out) | newPassword length | new password equals the current one
 * 401 UNAUTHORIZED (from withHandler, or the user record vanished)
 */
module.exports.handler = middleware.withHandler(
    async ({ body, session, user }) => {
        const { currentPassword, newPassword } = validate(body);

        const res = await database.doc.send(
            new GetCommand({ TableName: process.env.USERS_TABLE, Key: { email: user.email }, ConsistentRead: true })
        );
        const item = res.Item;
        if (!item || item.userId !== user.userId) throw errors.unauthorized();

        if (!(await verifyPassword(currentPassword, item.passwordHash))) {
            throw errors.validationFailed([WRONG_CURRENT]);
        }
        if (newPassword === currentPassword) {
            throw errors.validationFailed([
                { field: 'newPassword', message: 'New password must be different from the current password' },
            ]);
        }

        const passwordHash = await hashPassword(newPassword);
        // Taken after hashing, right before the write, so a sign-in with the old password in the
        // meantime is still before sessionsValidAfter.
        const now = new Date();
        const nowIso = now.toISOString();

        // One transaction: this session's createdAt is re-stamped to the sessionsValidAfter value written
        // on the user, so this session stays valid (common auth rejects sessions created before
        // sessionsValidAfter; equal is valid) and every other session stops working at once.
        // passwordHash = :old: a concurrent change or reset since the read wins; this one is refused and
        // this session is not re-stamped.
        try {
            await database.doc.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Update: {
                                TableName: process.env.SESSIONS_TABLE,
                                Key: { tokenHash: session.tokenHash },
                                UpdateExpression: 'SET createdAt = :now',
                                ConditionExpression: 'attribute_exists(tokenHash)',
                                ExpressionAttributeValues: { ':now': nowIso },
                            },
                        },
                        {
                            Update: {
                                TableName: process.env.USERS_TABLE,
                                Key: { email: item.email },
                                UpdateExpression:
                                    'SET passwordHash = :hash, sessionsValidAfter = :now, updatedAt = :now ' +
                                    'REMOVE passwordState, tempPasswordExpiresAt',
                                ConditionExpression: 'userId = :me AND passwordHash = :old',
                                ExpressionAttributeValues: {
                                    ':hash': passwordHash,
                                    ':now': nowIso,
                                    ':me': user.userId,
                                    ':old': item.passwordHash,
                                },
                            },
                        },
                    ],
                })
            );
        } catch (err) {
            if (!err || err.name !== 'TransactionCanceledException') throw err;
            const reasons = (err.CancellationReasons || []).map((r) => r && r.Code);
            // This session was deleted meanwhile (sign-out elsewhere): sign in again.
            if (reasons[0] === 'ConditionalCheckFailed') throw errors.unauthorized();
            if (reasons[1] === 'ConditionalCheckFailed') throw errors.validationFailed([WRONG_CURRENT]);
            throw err;
        }
        const updated = { ...item, passwordHash, sessionsValidAfter: nowIso, updatedAt: nowIso };
        delete updated.passwordState;
        delete updated.tempPasswordExpiresAt;

        // Only after the password update succeeded: the other sessions already fail (sessionsValidAfter);
        // delete their items as cleanup, keep this one.
        const revoked = await revokeSessions(user.userId, { exceptTokenHash: session.tokenHash });

        const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
        const expiresAt = expires.toISOString();
        await extendOwnSession(session.tokenHash, expires);

        logger.info('password changed', { userId: user.userId, sessionsEnded: revoked });
        return http.ok({ user: await sessionUser(updated), expiresAt }, { 'Cache-Control': 'no-store' });
    },
    { allowTemporaryPassword: true }
);
