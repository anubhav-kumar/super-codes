'use strict';

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, http } = require('common');
const { toUser } = require('../../utils/user');

// Every attribute of the User object except passwordHash, which is never read here.
const ATTRIBUTES = [
    'userId',
    'email',
    'name',
    'isAdmin',
    'workerId',
    'passwordState',
    'tempPasswordExpiresAt',
    'createdAt',
    'updatedAt',
];

/**
 * Reads every Users item (Scan, following LastEvaluatedKey). Named exception to "no Scan": the
 * table holds one item per staff member and only admins call this route.
 */
async function scanAllUsers() {
    const names = {};
    const projection = ATTRIBUTES.map((attr, i) => {
        names[`#a${i}`] = attr;
        return `#a${i}`;
    }).join(', ');
    const items = [];
    let ExclusiveStartKey;
    do {
        const res = await database.doc.send(
            new ScanCommand({
                TableName: process.env.USERS_TABLE,
                ProjectionExpression: projection,
                ExpressionAttributeNames: names,
                ExclusiveStartKey,
            })
        );
        items.push(...(res.Items || []));
        ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
}

function compareUsers(a, b) {
    const byName = String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return String(a.email || '').localeCompare(String(b.email || ''), 'en', { sensitivity: 'base' });
}

/**
 * GET /auth/users  (admin only: a member gets 404 NOT_FOUND)
 * 200 { items: [User object, ...], nextToken: null }
 *   Every user, unpaginated, sorted by name (case-insensitive), then email. User object: see
 *   utils/user.js toUser. Linked Worker names/statuses come from one BatchGet of the Workers table.
 */
module.exports.handler = middleware.withHandler(
    async () => {
        const items = (await scanAllUsers()).filter((item) => item.userId && item.email);
        const workers = await database.batchGetByIds(
            process.env.WORKERS_TABLE,
            'id',
            items.map((item) => item.workerId).filter(Boolean),
            ['name', 'status']
        );
        const now = Date.now();
        const users = items.map((item) => toUser(item, workers, now)).sort(compareUsers);
        return http.ok({ items: users, nextToken: null }, { 'Cache-Control': 'no-store' });
    },
    { adminOnly: true }
);
