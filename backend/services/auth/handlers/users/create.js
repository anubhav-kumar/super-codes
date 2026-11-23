'use strict';

const { GetCommand, QueryCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http, logger, validators } = require('common');
const { hashPassword } = require('../../utils/password');
const { toUser } = require('../../utils/user');
const { generateTemporaryPassword, temporaryPasswordExpiry } = require('../../utils/tempPassword');

const { check, normalizeString, parseEmail, isUuidV4, FieldError } = validators;
const NO_STORE = { 'Cache-Control': 'no-store' };

function validate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const details = [];
    const id = check(details, 'id', () => {
        if (!isUuidV4(body.id)) throw new FieldError('id must be a lowercase UUID v4');
        return body.id;
    });
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
    return { id, name, email, isAdmin, workerId };
}

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

/** 200 answer for a retry of a user that already exists: the temporary password is never shown again. */
async function existingResponse(item) {
    const workers = new Map();
    if (item.workerId) {
        const worker = await getWorker(item.workerId);
        if (worker) workers.set(item.workerId, worker);
    }
    const user = toUser(item, workers);
    return http.ok(
        { user, temporaryPassword: null, temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt },
        NO_STORE
    );
}

/**
 * POST /auth/users  (admin only: a member gets 404 NOT_FOUND)
 * Body { id: uuid v4 (becomes userId), name: 1-100, email: valid, max 254, isAdmin: boolean,
 *        workerId: uuid v4 | null }
 * 201 { user: User object (status MUST_SET_PASSWORD), temporaryPassword: 14 chars,
 *       temporaryPasswordExpiresAt: ISO (now + 2 h) }
 *   The temporary password is returned only here: it is stored only as a scrypt hash and never logged.
 * 200 { user, temporaryPassword: null, temporaryPasswordExpiresAt: ISO | null }  a user with this id
 *   already exists (idempotent retry; use Reset password for a new temporary password)
 * 400 VALIDATION_FAILED (id, name, email, isAdmin, workerId) | REFERENCE_NOT_FOUND workerId
 * 409 EMAIL_TAKEN email | WORKER_INACTIVE workerId | WORKER_ALREADY_LINKED workerId
 */
module.exports.handler = middleware.withHandler(
    async ({ body, user: caller }) => {
        const input = validate(body);

        const existing = await findUserById(input.id);
        if (existing) return existingResponse(existing);

        let worker = null;
        if (input.workerId) {
            worker = await getWorker(input.workerId);
            if (!worker) {
                throw errors.referenceNotFound([{ field: 'workerId', message: 'This worker does not exist' }]);
            }
            if (worker.status === 'INACTIVE') {
                throw errors.conflict('WORKER_INACTIVE', 'This worker is inactive', [
                    { field: 'workerId', message: 'This worker is inactive' },
                ]);
            }
        }

        const temporaryPassword = generateTemporaryPassword();
        const now = new Date();
        const nowIso = now.toISOString();
        const expiresAt = temporaryPasswordExpiry(now);
        const item = {
            email: input.email,
            userId: input.id,
            name: input.name,
            passwordHash: await hashPassword(temporaryPassword),
            isAdmin: input.isAdmin,
            passwordState: 'TEMPORARY',
            tempPasswordExpiresAt: expiresAt,
            entity: 'USER',
            createdAt: nowIso,
            updatedAt: nowIso,
        };
        if (input.workerId) item.workerId = input.workerId;

        const transactItems = [
            {
                Put: {
                    TableName: process.env.USERS_TABLE,
                    Item: item,
                    ConditionExpression: 'attribute_not_exists(email)',
                },
            },
        ];
        if (input.workerId) {
            transactItems.push({
                Put: {
                    TableName: process.env.WORKER_LINKS_TABLE,
                    Item: { workerId: input.workerId, userId: input.id, createdAt: nowIso, updatedAt: nowIso },
                    ConditionExpression: 'attribute_not_exists(workerId) OR userId = :me',
                    ExpressionAttributeValues: { ':me': input.id },
                },
            });
        }

        try {
            await database.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
        } catch (err) {
            if (!err || err.name !== 'TransactionCanceledException') throw err;
            const reasons = (err.CancellationReasons || []).map((r) => r && r.Code);
            if (reasons[0] === 'ConditionalCheckFailed') {
                // A retry can race the byUserId GSI: the email then already holds this very user.
                const current = await getUserByEmail(input.email);
                if (current && current.userId === input.id) return existingResponse(current);
                throw errors.conflict('EMAIL_TAKEN', 'A user with this email already exists', [
                    { field: 'email', message: 'A user with this email already exists' },
                ]);
            }
            if (reasons[1] === 'ConditionalCheckFailed') {
                throw errors.conflict('WORKER_ALREADY_LINKED', 'This worker is already linked to another user', [
                    { field: 'workerId', message: 'This worker is already linked to another user' },
                ]);
            }
            throw err;
        }

        logger.info('user created', { userId: input.id, isAdmin: input.isAdmin, byUserId: caller.userId });
        const workers = worker ? new Map([[input.workerId, worker]]) : new Map();
        return http.created(
            { user: toUser(item, workers, now.getTime()), temporaryPassword, temporaryPasswordExpiresAt: expiresAt },
            NO_STORE
        );
    },
    { adminOnly: true }
);
