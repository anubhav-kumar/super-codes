'use strict';

const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http, logger, validators } = require('common');
const { hashPassword } = require('../../utils/password');
const { toUser, findUserById } = require('../../utils/user');
const { revokeSessions } = require('../../utils/sessions');
const { generateTemporaryPassword, temporaryPasswordExpiry } = require('../../utils/tempPassword');

const NO_STORE = { 'Cache-Control': 'no-store' };
const ATTEMPTS = 2;

/**
 * Writes the temporary password on the user's current item. Returns the updated item, or null when
 * the user no longer exists. The item is keyed by email, so an email change between the read and the
 * write (condition userId = :id fails) is retried once with a fresh read.
 */
async function writeTemporaryPassword(userId, fields) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        const target = await findUserById(userId);
        if (!target) return null;
        try {
            const out = await database.doc.send(
                new UpdateCommand({
                    TableName: process.env.USERS_TABLE,
                    Key: { email: target.email },
                    UpdateExpression:
                        'SET passwordHash = :hash, passwordState = :temp, tempPasswordExpiresAt = :exp, ' +
                        'sessionsValidAfter = :now, updatedAt = :now',
                    ConditionExpression: 'userId = :id',
                    ExpressionAttributeValues: {
                        ':hash': fields.passwordHash,
                        ':temp': 'TEMPORARY',
                        ':exp': fields.expiresAt,
                        ':now': fields.now,
                        ':id': userId,
                    },
                    ReturnValues: 'ALL_NEW',
                })
            );
            return out.Attributes;
        } catch (err) {
            if (!err || err.name !== 'ConditionalCheckFailedException') throw err;
        }
    }
    return null;
}

/**
 * POST /auth/users/{id}/reset-password  (admin only: a member gets 404 NOT_FOUND; no body)
 * 200 { user: User object (status MUST_SET_PASSWORD), temporaryPassword: 14 chars,
 *       temporaryPasswordExpiresAt: ISO (now + 2 h) }
 *   Sets a new temporary password (stored only as a scrypt hash, never logged), passwordState
 *   TEMPORARY and sessionsValidAfter = now, so every session of the user stops working at once
 *   (common auth); the Sessions items are then deleted as cleanup. Not idempotent: each call issues
 *   a new password. Allowed for any other user, admin or member.
 * 404 NOT_FOUND unknown id
 * 409 CANNOT_RESET_SELF the caller's own account (use Change password)
 */
module.exports.handler = middleware.withHandler(
    async ({ event, user: caller }) => {
        const id = event && event.pathParameters && event.pathParameters.id;
        if (!validators.isUuidV4(id)) throw errors.notFound();
        if (id === caller.userId) {
            throw errors.conflict('CANNOT_RESET_SELF', 'Use Change password for your own account');
        }

        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);
        // Taken after hashing, right before the write: sessionsValidAfter is as late as possible.
        const now = new Date();
        const expiresAt = temporaryPasswordExpiry(now);
        const item = await writeTemporaryPassword(id, { passwordHash, expiresAt, now: now.toISOString() });
        if (!item) throw errors.notFound();

        const sessionsEnded = await revokeSessions(id);

        const workers = item.workerId
            ? await database.batchGetByIds(process.env.WORKERS_TABLE, 'id', [item.workerId], ['name', 'status'])
            : new Map();
        logger.info('password reset', { userId: id, byUserId: caller.userId, sessionsEnded });
        return http.ok(
            { user: toUser(item, workers, now.getTime()), temporaryPassword, temporaryPasswordExpiresAt: expiresAt },
            NO_STORE
        );
    },
    { adminOnly: true }
);
