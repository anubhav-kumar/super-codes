'use strict';

const crypto = require('crypto');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, auth, http, logger } = require('common');
const { verifyPassword, dummyHash } = require('../utils/password');

const SESSION_DAYS = 30;
const INVALID_CREDENTIALS = 'Incorrect email or password';

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
 * 200 { token, expiresAt, user: { id, email, name } }
 * 400 VALIDATION_FAILED, 401 INVALID_CREDENTIALS
 */
module.exports.handler = middleware.withHandler(
    async ({ body }) => {
        const { email, password } = validate(body);

        const res = await database.doc.send(
            new GetCommand({ TableName: process.env.USERS_TABLE, Key: { email } })
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

        const token = crypto.randomBytes(32).toString('base64url');
        const now = new Date();
        const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
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

        logger.info('signed in', { userId: user.userId });
        return http.ok(
            { token, expiresAt, user: { id: user.userId, email: user.email, name: user.name } },
            { 'Cache-Control': 'no-store' }
        );
    },
    { auth: false }
);
