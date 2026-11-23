'use strict';

/**
 * Session user object shared by POST /auth/login, GET /auth/me and POST /auth/password:
 *   { id, email, name, isAdmin, workerId, workerName, mustChangePassword }
 */

const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { database, auth } = require('common');

/** Users written before FR1 have no isAdmin and are admins (never use !!item.isAdmin). */
function isAdminItem(item) {
    return auth.effectiveIsAdmin(item);
}

/** Name of the linked Worker, or null when there is no link or the Worker record is missing. */
async function loadWorkerName(workerId) {
    if (!workerId) return null;
    const res = await database.doc.send(
        new GetCommand({
            TableName: process.env.WORKERS_TABLE,
            Key: { id: workerId },
            ProjectionExpression: '#n',
            ExpressionAttributeNames: { '#n': 'name' },
        })
    );
    return (res.Item && res.Item.name) || null;
}

/**
 * Builds the session user object. `user` is either a Users table item or the user object from
 * withHandler (common auth.toUser); both are normalized through auth.toUser.
 */
function toSessionUser(user, workerName = null) {
    const u = user && typeof user.mustChangePassword === 'boolean' ? user : auth.toUser(user);
    return {
        id: u.userId,
        email: u.email,
        name: u.name,
        isAdmin: u.isAdmin,
        workerId: u.workerId,
        workerName: u.workerId ? workerName : null,
        mustChangePassword: u.mustChangePassword,
    };
}

/** Loads the linked Worker's name and returns the session user object. */
async function sessionUser(user) {
    const u = user && typeof user.mustChangePassword === 'boolean' ? user : auth.toUser(user);
    return toSessionUser(u, await loadWorkerName(u.workerId));
}

module.exports = { isAdminItem, loadWorkerName, toSessionUser, sessionUser };
