'use strict';

const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http, logger, validators } = require('common');
const { findUserById, isAdminItem, countAdmins } = require('../../utils/user');
const { revokeSessions } = require('../../utils/sessions');

const ATTEMPTS = 2;

/**
 * One attempt: load the target, run the last-admin guard and delete the Users item with its
 * WorkerLinks item in one transaction. Returns { target }, { missing: true } when the user does not
 * exist, or { retry: true } when the Users item changed (e.g. email re-keyed) between read and write.
 */
async function attemptDelete(id) {
    const target = await findUserById(id);
    if (!target) return { missing: true };

    if (isAdminItem(target) && (await countAdmins()) <= 1) {
        throw errors.conflict('LAST_ADMIN', 'There must always be at least one admin');
    }

    const transactItems = [
        {
            Delete: {
                TableName: process.env.USERS_TABLE,
                Key: { email: target.email },
                ConditionExpression: 'userId = :id',
                ExpressionAttributeValues: { ':id': id },
            },
        },
    ];
    if (target.workerId) {
        // Tolerates a missing link item; never deletes a link that now belongs to another user.
        transactItems.push({
            Delete: {
                TableName: process.env.WORKER_LINKS_TABLE,
                Key: { workerId: target.workerId },
                ConditionExpression: 'attribute_not_exists(workerId) OR userId = :id',
                ExpressionAttributeValues: { ':id': id },
            },
        });
    }

    try {
        await database.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (err) {
        if (!err || err.name !== 'TransactionCanceledException') throw err;
        const conditionFailed = (err.CancellationReasons || []).some((r) => r && r.Code === 'ConditionalCheckFailed');
        if (conditionFailed) return { retry: true };
        throw err;
    }
    return { target };
}

/**
 * DELETE /auth/users/{id}  (admin only: a member gets 404 NOT_FOUND; no body)
 * 204 (empty)
 *   Deletes the Users item and its WorkerLinks item in one transaction, then deletes every session of
 *   the user (cleanup: a deleted user's sessions already get 401, because common auth loads the user
 *   on every request). The Worker, its assignments and orders are untouched. The email is free for a
 *   new user at once.
 * 404 NOT_FOUND unknown id
 * 409 CANNOT_DELETE_SELF the caller's own account | LAST_ADMIN the only admin
 *     | USER_CHANGED the user changed twice while deleting (reload and try again)
 */
module.exports.handler = middleware.withHandler(
    async ({ event, user: caller }) => {
        const id = event && event.pathParameters && event.pathParameters.id;
        if (!validators.isUuidV4(id)) throw errors.notFound();
        if (id === caller.userId) {
            throw errors.conflict('CANNOT_DELETE_SELF', 'You cannot delete your own account');
        }

        let result = { retry: true };
        for (let attempt = 0; attempt < ATTEMPTS && result.retry; attempt += 1) {
            result = await attemptDelete(id);
        }
        if (result.missing) throw errors.notFound();
        if (result.retry) {
            throw errors.conflict('USER_CHANGED', 'This user was changed by someone else. Reload and try again.');
        }

        const sessionsEnded = await revokeSessions(id);
        logger.info('user deleted', {
            userId: id,
            byUserId: caller.userId,
            workerUnlinked: Boolean(result.target.workerId),
            sessionsEnded,
        });
        return http.noContent();
    },
    { adminOnly: true }
);
