'use strict';

const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { database, errors, validators } = require('common');
const scope = require('common/scope');

/**
 * Scope check for every timeline route. Returns the Orders item, or throws 404 NOT_FOUND when the
 * id is not a UUID v4, the order does not exist, or the caller is a member whose Worker is not
 * assigned to it (member with no Worker: always 404). `consistent` reads both strongly (before writes).
 */
async function loadOrderForScope(user, orderId, { consistent = false } = {}) {
    if (!validators.isUuidV4(orderId)) throw errors.notFound();
    if (scope.isMember(user) && !(await scope.isOrderVisible(user, orderId, { consistent }))) {
        throw errors.notFound();
    }
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.ORDERS_TABLE, Key: { id: orderId }, ConsistentRead: consistent })
    );
    if (!res.Item) throw errors.notFound();
    return res.Item;
}

/**
 * Entries item -> API Entry for the caller. Keys of the other kind are absent (not null).
 * canEdit: author only. canDelete: author or admin.
 */
function toEntry(item, user) {
    const entry = {
        id: item.id,
        orderId: item.orderId,
        kind: item.kind,
        createdAt: item.createdAt,
        actor: { id: item.actorUserId, name: item.actorName },
    };
    if (item.kind === 'COMMENT') {
        const isAuthor = Boolean(user) && item.actorUserId === user.userId;
        entry.text = item.text;
        entry.editedAt = item.editedAt || null;
        entry.statusChange = item.statusChange ? { from: item.statusChange.from, to: item.statusChange.to } : null;
        entry.mentions = Array.isArray(item.mentions) ? item.mentions.map((m) => ({ userId: m.userId, name: m.name })) : [];
        entry.files = [];
        entry.canEdit = isAuthor;
        entry.canDelete = isAuthor || !scope.isMember(user);
    } else {
        entry.type = item.type;
        entry.details = item.details || {};
    }
    return entry;
}

module.exports = { loadOrderForScope, toEntry };
