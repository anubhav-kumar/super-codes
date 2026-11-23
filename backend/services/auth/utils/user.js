'use strict';

/**
 * Session user object shared by POST /auth/login, GET /auth/me and POST /auth/password:
 *   { id, email, name, isAdmin, workerId, workerName, mustChangePassword }
 * User object of the admin user-management routes (/auth/users, P-25): see toUser.
 */

const { GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { database, auth } = require('common');

/** Users written before FR1 have no isAdmin and are admins (never use !!item.isAdmin). */
function isAdminItem(item) {
    return auth.effectiveIsAdmin(item);
}

/** Users item with this email (consistent read), or null. */
async function getUserByEmail(email) {
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.USERS_TABLE, Key: { email }, ConsistentRead: true })
    );
    return res.Item || null;
}

/**
 * Current Users item with this userId, or null. The byUserId GSI is eventually consistent, so each
 * candidate is re-read by its email (consistent) and kept only if it still carries this userId.
 */
async function findUserById(userId) {
    const res = await database.doc.send(
        new QueryCommand({
            TableName: process.env.USERS_TABLE,
            IndexName: 'byUserId',
            KeyConditionExpression: 'userId = :id',
            ExpressionAttributeValues: { ':id': userId },
            ProjectionExpression: 'email',
        })
    );
    for (const candidate of res.Items || []) {
        const item = await getUserByEmail(candidate.email);
        if (item && item.userId === userId) return item;
    }
    return null;
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

/**
 * Account status of a Users item: ACTIVE (no temporary password), MUST_SET_PASSWORD (temporary
 * password not yet expired) or TEMP_PASSWORD_EXPIRED.
 */
function userStatus(item, now = Date.now()) {
    if (!auth.hasTemporaryPassword(item)) return 'ACTIVE';
    const expiresAt = item.tempPasswordExpiresAt ? Date.parse(item.tempPasswordExpiresAt) : NaN;
    return expiresAt > now ? 'MUST_SET_PASSWORD' : 'TEMP_PASSWORD_EXPIRED';
}

/**
 * User object of the admin routes. `workers` is a Map of workerId -> Workers item ({ id, name, status }).
 *   { id, email, name, isAdmin,
 *     worker: { id, name|null, status|null } | null,   name/status null only if the Worker is missing
 *     status: ACTIVE | MUST_SET_PASSWORD | TEMP_PASSWORD_EXPIRED,
 *     temporaryPasswordExpiresAt: ISO | null, createdAt, updatedAt }
 * Never includes passwordHash.
 */
function toUser(item, workers = new Map(), now = Date.now()) {
    const worker = item.workerId ? workers.get(item.workerId) : null;
    return {
        id: item.userId,
        email: item.email,
        name: item.name,
        isAdmin: isAdminItem(item),
        worker: item.workerId
            ? { id: item.workerId, name: (worker && worker.name) || null, status: (worker && worker.status) || null }
            : null,
        status: userStatus(item, now),
        temporaryPasswordExpiresAt: auth.hasTemporaryPassword(item) ? item.tempPasswordExpiresAt || null : null,
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || item.createdAt || null,
    };
}

module.exports = {
    isAdminItem,
    getUserByEmail,
    findUserById,
    loadWorkerName,
    toSessionUser,
    sessionUser,
    userStatus,
    toUser,
};
