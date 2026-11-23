'use strict';

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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
 * POST /auth/password  (allowed while a temporary password is active; this is also the forced
 * "Set a new password" route, where currentPassword is the temporary password)
 * Body { currentPassword, newPassword }
 * 200 { user: session user object (mustChangePassword false), expiresAt }
 *   Sets the new password, clears the temporary-password state, ends every other session of the
 *   user and extends this session to now + 30 days.
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

        const now = new Date();
        let updated;
        try {
            const out = await database.doc.send(
                new UpdateCommand({
                    TableName: process.env.USERS_TABLE,
                    Key: { email: item.email },
                    UpdateExpression: 'SET passwordHash = :hash, updatedAt = :now REMOVE passwordState, tempPasswordExpiresAt',
                    // passwordHash = :old: a concurrent change or reset since the read wins; this one is refused.
                    ConditionExpression: 'userId = :me AND passwordHash = :old',
                    ExpressionAttributeValues: {
                        ':hash': await hashPassword(newPassword),
                        ':now': now.toISOString(),
                        ':me': user.userId,
                        ':old': item.passwordHash,
                    },
                    ReturnValues: 'ALL_NEW',
                })
            );
            updated = out.Attributes;
        } catch (err) {
            if (err && err.name === 'ConditionalCheckFailedException') throw errors.validationFailed([WRONG_CURRENT]);
            throw err;
        }

        // Only after the password update succeeded: end the user's other sessions, keep this one.
        const revoked = await revokeSessions(user.userId, { exceptTokenHash: session.tokenHash });

        const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
        const expiresAt = expires.toISOString();
        try {
            await database.doc.send(
                new UpdateCommand({
                    TableName: process.env.SESSIONS_TABLE,
                    Key: { tokenHash: session.tokenHash },
                    UpdateExpression: 'SET expiresAt = :exp, #ttl = :ttl',
                    ConditionExpression: 'attribute_exists(tokenHash)',
                    ExpressionAttributeNames: { '#ttl': 'ttl' },
                    ExpressionAttributeValues: { ':exp': expiresAt, ':ttl': Math.floor(expires.getTime() / 1000) },
                })
            );
        } catch (err) {
            // This session was deleted meanwhile (sign-out elsewhere): the password is changed, but sign in again.
            if (err && err.name === 'ConditionalCheckFailedException') throw errors.unauthorized();
            throw err;
        }

        logger.info('password changed', { userId: user.userId, sessionsEnded: revoked });
        return http.ok({ user: await sessionUser(updated), expiresAt }, { 'Cache-Control': 'no-store' });
    },
    { allowTemporaryPassword: true }
);
