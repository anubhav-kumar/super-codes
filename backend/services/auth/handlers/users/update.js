'use strict';

const { GetCommand, UpdateCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http, logger, validators } = require('common');
const { toUser, findUserById, isAdminItem, countAdmins } = require('../../utils/user');

const { check, normalizeString, parseEmail, isUuidV4, FieldError } = validators;
const NO_STORE = { 'Cache-Control': 'no-store' };
const ATTEMPTS = 2;

function validate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const details = [];
    const name = check(details, 'name', () => normalizeString(body.name, { min: 1, max: 100, label: 'Name' }), {
        required: true,
        requiredMessage: 'Name is required',
    });
    const email = check(details, 'email', () => parseEmail(body.email), {
        required: true,
        requiredMessage: 'Email is required',
    });
    const isAdmin = check(details, 'isAdmin', () => {
        if (typeof body.isAdmin !== 'boolean') throw new FieldError('isAdmin must be true or false');
        return body.isAdmin;
    });
    const workerId = check(details, 'workerId', () => {
        if (body.workerId === undefined || body.workerId === null) return null;
        if (!isUuidV4(body.workerId)) throw new FieldError('workerId must be a lowercase UUID v4 or null');
        return body.workerId;
    });
    if (details.length) throw errors.validationFailed(details);
    return { name, email, isAdmin, workerId };
}

async function getWorker(workerId) {
    const res = await database.doc.send(
        new GetCommand({
            TableName: process.env.WORKERS_TABLE,
            Key: { id: workerId },
            ProjectionExpression: '#i, #n, #s',
            ExpressionAttributeNames: { '#i': 'id', '#n': 'name', '#s': 'status' },
            ConsistentRead: true,
        })
    );
    return res.Item || null;
}

/** Worker of a new link: must exist (400 REFERENCE_NOT_FOUND) and be ACTIVE (409 WORKER_INACTIVE). */
async function checkNewWorker(workerId) {
    const worker = await getWorker(workerId);
    if (!worker) {
        throw errors.referenceNotFound([{ field: 'workerId', message: 'This worker does not exist' }]);
    }
    if (worker.status === 'INACTIVE') {
        throw errors.conflict('WORKER_INACTIVE', 'This worker is inactive', [
            { field: 'workerId', message: 'This worker is inactive' },
        ]);
    }
    return worker;
}

const emailTaken = () =>
    errors.conflict('EMAIL_TAKEN', 'A user with this email already exists', [
        { field: 'email', message: 'A user with this email already exists' },
    ]);

const workerAlreadyLinked = () =>
    errors.conflict('WORKER_ALREADY_LINKED', 'This worker is already linked to another user', [
        { field: 'workerId', message: 'This worker is already linked to another user' },
    ]);

/**
 * Condition that the Users item is still the one this attempt read: same userId and same updatedAt
 * (absent stays absent). Every write to a Users item (edit, password change, admin reset,
 * create-user.js --overwrite) sets updatedAt, so a password change, reset or session revocation
 * since the read fails it and the edit re-reads instead of writing stale values back.
 */
function unchangedSince(target) {
    const values = { ':id': target.userId };
    let expr = 'attribute_exists(email) AND userId = :id AND ';
    if (target.updatedAt === undefined) {
        expr += 'attribute_not_exists(updatedAt)';
    } else {
        expr += 'updatedAt = :readUpdatedAt';
        values[':readUpdatedAt'] = target.updatedAt;
    }
    return { ConditionExpression: expr, ExpressionAttributeValues: values };
}

/**
 * Builds the TransactWriteItems of one edit. Returns { transactItems, roles } where roles[i] names
 * what item i guards ('user', 'newEmail', 'link') for mapping cancellation reasons.
 * Same email: an Update that sets only name, isAdmin, workerId and updatedAt, so passwordHash,
 * passwordState, tempPasswordExpiresAt and sessionsValidAfter are never written by an edit.
 * An email change re-keys the item (Delete old key + Put new key); the new item is a copy of the
 * whole read item with the edited fields replaced. The Delete is conditioned on the read updatedAt,
 * so the copy is only written if the old item (password, revocation state) is still exactly as read.
 */
function buildTransaction(target, item, nowIso) {
    const id = target.userId;
    const transactItems = [];
    const roles = [];
    const guard = unchangedSince(target);
    if (item.email === target.email) {
        const values = {
            ...guard.ExpressionAttributeValues,
            ':name': item.name,
            ':isAdmin': item.isAdmin,
            ':now': nowIso,
        };
        let updateExpression = 'SET #n = :name, isAdmin = :isAdmin, updatedAt = :now';
        if (item.workerId) {
            updateExpression += ', workerId = :workerId';
            values[':workerId'] = item.workerId;
        } else {
            updateExpression += ' REMOVE workerId';
        }
        transactItems.push({
            Update: {
                TableName: process.env.USERS_TABLE,
                Key: { email: target.email },
                UpdateExpression: updateExpression,
                ConditionExpression: guard.ConditionExpression,
                ExpressionAttributeNames: { '#n': 'name' },
                ExpressionAttributeValues: values,
            },
        });
        roles.push('user');
    } else {
        transactItems.push({
            Delete: {
                TableName: process.env.USERS_TABLE,
                Key: { email: target.email },
                ...guard,
            },
        });
        roles.push('user');
        // The new key's own condition can only be "absent"; the read-updatedAt guard is on the Delete
        // of the old key in the same transaction (one transaction cannot touch the old item twice).
        transactItems.push({
            Put: {
                TableName: process.env.USERS_TABLE,
                Item: item,
                ConditionExpression: 'attribute_not_exists(email)',
            },
        });
        roles.push('newEmail');
    }

    const oldWorkerId = target.workerId || null;
    const newWorkerId = item.workerId || null;
    if (newWorkerId !== oldWorkerId) {
        if (newWorkerId) {
            transactItems.push({
                Put: {
                    TableName: process.env.WORKER_LINKS_TABLE,
                    Item: { workerId: newWorkerId, userId: id, createdAt: nowIso, updatedAt: nowIso },
                    ConditionExpression: 'attribute_not_exists(workerId) OR userId = :me',
                    ExpressionAttributeValues: { ':me': id },
                },
            });
            roles.push('link');
        }
        if (oldWorkerId) {
            // Tolerates a missing link item; never deletes a link that now belongs to another user.
            transactItems.push({
                Delete: {
                    TableName: process.env.WORKER_LINKS_TABLE,
                    Key: { workerId: oldWorkerId },
                    ConditionExpression: 'attribute_not_exists(workerId) OR userId = :me',
                    ExpressionAttributeValues: { ':me': id },
                },
            });
            roles.push('oldLink');
        }
    }
    return { transactItems, roles };
}

/**
 * After an email change, points every session of the user at the new email so requireUser finds the
 * user with one GetItem again (until then its byUserId fallback covers the gap). A session deleted
 * meanwhile is skipped.
 */
async function moveSessionsToEmail(userId, email) {
    const sessions = await database.queryAll({
        TableName: process.env.SESSIONS_TABLE,
        IndexName: 'byUserId',
        KeyConditionExpression: 'userId = :id',
        ExpressionAttributeValues: { ':id': userId },
        ProjectionExpression: 'tokenHash',
    });
    const hashes = [...new Set(sessions.map((s) => s.tokenHash))].filter(Boolean);
    for (let i = 0; i < hashes.length; i += 16) {
        await Promise.all(
            hashes.slice(i, i + 16).map(async (tokenHash) => {
                try {
                    await database.doc.send(
                        new UpdateCommand({
                            TableName: process.env.SESSIONS_TABLE,
                            Key: { tokenHash },
                            UpdateExpression: 'SET email = :email',
                            ConditionExpression: 'attribute_exists(tokenHash) AND userId = :id',
                            ExpressionAttributeValues: { ':email': email, ':id': userId },
                        })
                    );
                } catch (err) {
                    if (!err || err.name !== 'ConditionalCheckFailedException') throw err;
                }
            })
        );
    }
    return hashes.length;
}

/**
 * One attempt: load the target, run the guards and write. Returns { item, workers, target }, or
 * { retry: true } when the user item changed between the read and the write.
 */
async function attemptUpdate(id, input, caller) {
    const target = await findUserById(id);
    if (!target) throw errors.notFound();

    const demoting = isAdminItem(target) && input.isAdmin === false;
    if (id === caller.userId && input.isAdmin === false) {
        throw errors.conflict('CANNOT_DEMOTE_SELF', 'You cannot remove your own admin access', [
            { field: 'isAdmin', message: 'You cannot remove your own admin access' },
        ]);
    }
    if (demoting && (await countAdmins()) <= 1) {
        throw errors.conflict('LAST_ADMIN', 'There must always be at least one admin', [
            { field: 'isAdmin', message: 'There must always be at least one admin' },
        ]);
    }

    const workers = new Map();
    if (input.workerId) {
        // A new link must be to an existing ACTIVE Worker; an unchanged link is kept even if inactive.
        const linkChanged = input.workerId !== (target.workerId || null);
        const worker = linkChanged ? await checkNewWorker(input.workerId) : await getWorker(input.workerId);
        if (worker) workers.set(input.workerId, worker);
    }

    const nowIso = new Date().toISOString();
    const item = {
        ...target,
        email: input.email,
        name: input.name,
        isAdmin: input.isAdmin,
        entity: 'USER',
        updatedAt: nowIso,
    };
    if (input.workerId) item.workerId = input.workerId;
    else delete item.workerId;

    const { transactItems, roles } = buildTransaction(target, item, nowIso);
    try {
        await database.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (err) {
        if (!err || err.name !== 'TransactionCanceledException') throw err;
        const failed = (err.CancellationReasons || [])
            .map((r, i) => (r && r.Code === 'ConditionalCheckFailed' ? roles[i] : null))
            .filter(Boolean);
        if (failed.includes('newEmail')) throw emailTaken();
        if (failed.includes('link')) throw workerAlreadyLinked();
        if (failed.includes('user') || failed.includes('oldLink')) return { retry: true };
        throw err;
    }
    return { item, workers, target };
}

/**
 * PUT /auth/users/{id}  (admin only: a member gets 404 NOT_FOUND)
 * Body { name: 1-100, email: valid, max 254, isAdmin: boolean, workerId: uuid v4 | null }
 *   Full editable set; workerId null unlinks (the Worker and its orders stay).
 * 200 { user: User object }
 *   Password, temporary-password state, sessionsValidAfter and sessions are not touched: every write
 *   is conditioned on the read updatedAt, so a concurrent password change, reset or revocation makes
 *   the edit re-read and retry once (then 409 USER_CHANGED) instead of writing stale values. An email
 *   change re-keys the Users item in one transaction (with any Worker link change) and then points
 *   the user's sessions at the new email; the user signs in with the new email next time. Role and
 *   Worker link apply on the user's next request (requireUser reads the record every time).
 * 400 VALIDATION_FAILED name | email | isAdmin | workerId; REFERENCE_NOT_FOUND workerId
 * 404 NOT_FOUND unknown id
 * 409 EMAIL_TAKEN email | WORKER_ALREADY_LINKED workerId | WORKER_INACTIVE workerId (only a new link)
 *     | CANNOT_DEMOTE_SELF isAdmin | LAST_ADMIN isAdmin | USER_CHANGED (changed twice during the edit)
 */
module.exports.handler = middleware.withHandler(
    async ({ event, body, user: caller }) => {
        const id = event && event.pathParameters && event.pathParameters.id;
        if (!isUuidV4(id)) throw errors.notFound();
        const input = validate(body);

        let result = { retry: true };
        for (let attempt = 0; attempt < ATTEMPTS && result.retry; attempt += 1) {
            result = await attemptUpdate(id, input, caller);
        }
        if (result.retry) {
            throw errors.conflict('USER_CHANGED', 'This user was changed by someone else. Reload and try again.');
        }
        const { item, workers, target } = result;

        const emailChanged = item.email !== target.email;
        const sessionsMoved = emailChanged ? await moveSessionsToEmail(id, item.email) : 0;

        logger.info('user updated', {
            userId: id,
            byUserId: caller.userId,
            isAdmin: item.isAdmin,
            emailChanged,
            workerLinkChanged: (item.workerId || null) !== (target.workerId || null),
            sessionsMoved,
        });
        return http.ok({ user: toUser(item, workers) }, NO_STORE);
    },
    { adminOnly: true }
);
