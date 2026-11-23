'use strict';

const crypto = require('crypto');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, auth, http, logger } = require('common');
const { verifyPassword, dummyHash } = require('../utils/password');
const { sessionUser } = require('../utils/user');

const SESSION_DAYS = 30;
const INVALID_CREDENTIALS = 'Incorrect email or password';
const TEMPORARY_PASSWORD_EXPIRED = 'This temporary password has expired. Ask an admin to reset your password.';

function validate(body) {
    const details = [];
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const { email, password } = body;
    let normalizedEmail = null;
    if (typeof email !== 'string' || email.trim() === '') {
        details.push({ field: 'email', message: 'Email is required' });
    } else {
        normalizedEmail = email.trim().toLowerCase();
        if (normalizedEmail.length < 3 || normalizedEmail.length > 254) {
            details.push({ field: 'email', message: 'Email must be 3-254 characters' });
        }
    }
    if (typeof password !== 'string' || password.length === 0) {
        details.push({ field: 'password', message: 'Password is required' });
    } else if (password.length > 200) {
        details.push({ field: 'password', message: 'Password must be at most 200 characters' });
    }
    if (details.length) throw errors.validationFailed(details);
    return { email: normalizedEmail, password };
}

/**
 * POST /auth/login  (no Authorization)
 * 200 { token, expiresAt, user: { id, email, name, isAdmin, workerId, workerName, mustChangePassword } }
 * Users without an isAdmin attribute (written before FR1) are admins.
 * Temporary password (F-50): the session ends when the temporary password expires
 * (expiresAt = tempPasswordExpiresAt) and user.mustChangePassword is true.
 * 400 VALIDATION_FAILED, 401 INVALID_CREDENTIALS,
 * 401 TEMPORARY_PASSWORD_EXPIRED (correct but expired temporary password; checked only after the
 *   password matched, so a wrong password never reveals that the email holds a temporary password)
 */
module.exports.handler = middleware.withHandler(
    async ({ body }) => {
        const { email, password } = validate(body);

        const res = await database.doc.send(
            new GetCommand({ TableName: process.env.USERS_TABLE, Key: { email }, ConsistentRead: true })
        );
        const user = res.Item;

        let ok;
        if (user) {
            ok = await verifyPassword(password, user.passwordHash);
        } else {
            await verifyPassword(password, await dummyHash());
            ok = false;
        }
        if (!ok) throw new errors.ApiError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);

        const now = new Date();
        let expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
        if (auth.hasTemporaryPassword(user)) {
            const tempExpiresMs = user.tempPasswordExpiresAt ? Date.parse(user.tempPasswordExpiresAt) : NaN;
            // A missing or unreadable expiry counts as expired, as in the common request gate.
            if (!(tempExpiresMs > now.getTime())) {
                throw new errors.ApiError(401, 'TEMPORARY_PASSWORD_EXPIRED', TEMPORARY_PASSWORD_EXPIRED);
            }
            if (tempExpiresMs < expires.getTime()) expires = new Date(tempExpiresMs);
        }

        const token = crypto.randomBytes(32).toString('base64url');
        const expiresAt = expires.toISOString();

        await database.doc.send(
            new PutCommand({
                TableName: process.env.SESSIONS_TABLE,
                Item: {
                    tokenHash: auth.hashToken(token),
                    userId: user.userId,
                    email: user.email,
                    name: user.name,
                    createdAt: now.toISOString(),
                    expiresAt,
                    ttl: Math.floor(expires.getTime() / 1000),
                },
                ConditionExpression: 'attribute_not_exists(tokenHash)',
            })
        );

        logger.info('signed in', { userId: user.userId, temporaryPassword: auth.hasTemporaryPassword(user) });
        return http.ok(
            { token, expiresAt, user: await sessionUser(user) },
            { 'Cache-Control': 'no-store' }
        );
    },
    { auth: false }
);
