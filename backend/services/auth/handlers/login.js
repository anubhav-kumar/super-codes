'use strict';

const crypto = require('crypto');
const { GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, auth, http, logger } = require('common');
const { verifyPassword, dummyHash } = require('../utils/password');
const { sessionUser } = require('../utils/user');

const SESSION_DAYS = 30;
const INVALID_CREDENTIALS = 'Incorrect email or password';
const TEMPORARY_PASSWORD_EXPIRED = 'This temporary password has expired. Ask an admin to reset your password.';
const TEMPORARY = 'TEMPORARY';

/**
 * ConditionCheck on the Users item: it still has the userId, passwordHash, temporary-password state
 * and sessionsValidAfter that this login verified. A password change, admin reset, delete or
 * re-keyed email between the verification and the session write makes the condition fail.
 */
function verifiedStateCheck(user) {
    const names = { '#ps': 'passwordState', '#sva': 'sessionsValidAfter' };
    const values = { ':uid': user.userId, ':hash': user.passwordHash, ':temp': TEMPORARY };
    const parts = ['userId = :uid', 'passwordHash = :hash'];
    if (auth.hasTemporaryPassword(user)) {
        names['#exp'] = 'tempPasswordExpiresAt';
        values[':exp'] = user.tempPasswordExpiresAt;
        parts.push('#ps = :temp', '#exp = :exp');
    } else {
        parts.push('(attribute_not_exists(#ps) OR #ps <> :temp)');
    }
    if (user.sessionsValidAfter !== undefined) {
        values[':sva'] = user.sessionsValidAfter;
        parts.push('#sva = :sva');
    } else {
        parts.push('attribute_not_exists(#sva)');
    }
    return {
        ConditionCheck: {
            TableName: process.env.USERS_TABLE,
            Key: { email: user.email },
            ConditionExpression: parts.join(' AND '),
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
        },
    };
}

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
 * The session is written in one transaction with a ConditionCheck on the Users item (the verified
 * password hash and temporary-password state). If the user changed meanwhile (password change, reset,
 * delete) no session is written and the answer is 401 INVALID_CREDENTIALS.
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

        try {
            await database.doc.send(
                new TransactWriteCommand({
                    TransactItems: [
                        verifiedStateCheck(user),
                        {
                            Put: {
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
                            },
                        },
                    ],
                })
            );
        } catch (err) {
            const reasons = (err && err.name === 'TransactionCanceledException' && err.CancellationReasons) || [];
            if (reasons[0] && reasons[0].Code === 'ConditionalCheckFailed') {
                logger.info('sign-in lost a race with a user change', { userId: user.userId });
                throw new errors.ApiError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
            }
            throw err;
        }

        logger.info('signed in', { userId: user.userId, temporaryPassword: auth.hasTemporaryPassword(user) });
        return http.ok(
            { token, expiresAt, user: await sessionUser(user) },
            { 'Cache-Control': 'no-store' }
        );
    },
    { auth: false }
);
