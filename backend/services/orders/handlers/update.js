'use strict';

const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const scope = require('common/scope');
const timeline = require('common/timeline');
const { parseOrder } = require('../validators/order');
const { buildOrderItem, getOrder, getAssignments, checkReferences } = require('../models/order');
const { toOrderDetail } = require('../utils/enrich');

/** True when the requested assignments are exactly the current ones (same workers and isPrimary, any order). */
function sameAssignments(requested, current) {
    if (requested.length !== current.length) return false;
    const byWorker = new Map(current.map((a) => [a.workerId, a.isPrimary === true]));
    return requested.every((a) => byWorker.has(a.workerId) && byWorker.get(a.workerId) === a.isPrimary);
}

/**
 * Member: a changed client / received-from must be a client of one of their visible orders,
 * otherwise 400 REFERENCE_NOT_FOUND on that field (same as a record that does not exist).
 * Unchanged values are always accepted.
 */
async function assertMemberClientChange(user, existing, fields) {
    const clientChanged = existing.clientType !== fields.clientType || existing.clientId !== fields.clientId;
    const receivedFromChanged = existing.receivedFromId !== fields.receivedFromId;
    if (!clientChanged && !receivedFromChanged) return;

    const { personIds, companyIds } = await scope.visibleClients(user, await scope.visibleOrderIds(user));
    const missing = [];
    if (clientChanged) {
        const allowed = fields.clientType === 'COMPANY' ? companyIds : personIds;
        if (!allowed.has(fields.clientId)) missing.push({ field: 'clientId', message: 'This client does not exist' });
    }
    if (receivedFromChanged && !personIds.has(fields.receivedFromId)) {
        missing.push({ field: 'receivedFromId', message: 'This person does not exist' });
    }
    if (missing.length) throw errors.referenceNotFound(missing);
}

/**
 * PUT /orders/{id}   full editable field set, including the full desired assignments list
 * 200 Order detail
 * 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND, 400 CLIENT_NOT_ELIGIBLE (only when the client
 * changed), 404 NOT_FOUND, 409 WORKER_INACTIVE (only for workers not already on this order)
 *
 * orderNumber never changes. Already assigned workers keep their assignedDate (even if inactive);
 * removed assignments are deleted; new ones get today (IST). One TransactWriteItems:
 * Put order (attribute_exists(id)) + Put new/changed assignments + Delete removed ones + (when the
 * status changes) Put a STATUS_CHANGED timeline event (F-59).
 *
 * Member (not admin): 404 NOT_FOUND unless their linked Worker is assigned to the order (checked
 * again inside the transaction). "assignments" may be omitted (current ones kept) or equal the
 * current set; any difference is 403 ASSIGNMENT_CHANGE_NOT_ALLOWED. A changed clientId /
 * receivedFromId must be a client of one of their visible orders (else 400 REFERENCE_NOT_FOUND).
 */
module.exports.handler = middleware.withHandler(async ({ event, body, user }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const member = scope.isMember(user);
    if (member && !(await scope.isOrderVisible(user, id, { consistent: true }))) throw errors.notFound();

    const fields = parseOrder(body, { isCreate: false, assignmentsOptional: member });

    const existing = await getOrder(id, { consistent: true });
    if (!existing) throw errors.notFound();

    const current = await getAssignments(id, { consistent: true });
    const currentByWorker = new Map(current.map((a) => [a.workerId, a]));

    if (member) {
        if (fields.assignments !== null && !sameAssignments(fields.assignments, current)) {
            throw errors.forbidden('ASSIGNMENT_CHANGE_NOT_ALLOWED', 'Only an admin can change who is assigned', [
                { field: 'assignments', message: 'Only an admin can change who is assigned' },
            ]);
        }
        fields.assignments = current.map((a) => ({ workerId: a.workerId, isPrimary: a.isPrimary === true }));
        await assertMemberClientChange(user, existing, fields);
    }

    const clientChanged = existing.clientType !== fields.clientType || existing.clientId !== fields.clientId;
    const lookups = await checkReferences(fields, {
        checkEligibility: clientChanged,
        alreadyAssigned: new Set(currentByWorker.keys()),
    });

    const now = new Date().toISOString();
    const today = validators.todayIst();
    const order = buildOrderItem(id, existing.orderSeq, fields, { createdAt: existing.createdAt, updatedAt: now });

    const desired = [];
    const puts = [];
    for (const a of fields.assignments) {
        const prev = currentByWorker.get(a.workerId);
        if (prev && prev.isPrimary === a.isPrimary) {
            desired.push(prev);
            continue;
        }
        const item = prev
            ? { ...prev, isPrimary: a.isPrimary, updatedAt: now }
            : { orderId: id, workerId: a.workerId, isPrimary: a.isPrimary, assignedDate: today, createdAt: now, updatedAt: now };
        desired.push(item);
        puts.push(item);
    }
    const keep = new Set(fields.assignments.map((a) => a.workerId));
    const removed = current.filter((a) => !keep.has(a.workerId));

    const transactItems = [
        { Put: { TableName: process.env.ORDERS_TABLE, Item: order, ConditionExpression: 'attribute_exists(id)' } },
        ...puts.map((item) => ({ Put: { TableName: process.env.ASSIGNMENTS_TABLE, Item: item } })),
        ...removed.map((a) => ({
            Delete: { TableName: process.env.ASSIGNMENTS_TABLE, Key: { orderId: id, workerId: a.workerId } },
        })),
    ];
    const statusChanged = fields.status !== existing.status;
    if (statusChanged) {
        // F-59: the timeline records every status change, in the same transaction as the order Put.
        transactItems.push(
            timeline.eventPut(
                timeline.buildEvent({
                    orderId: id,
                    type: 'STATUS_CHANGED',
                    user,
                    details: { from: existing.status, to: fields.status, commentId: null },
                    at: now,
                })
            )
        );
    }
    if (member) {
        // The member must still be assigned when the write lands (an admin may unassign them meanwhile).
        // A member never puts or deletes assignments, so this key is not touched twice in the transaction.
        transactItems.push({
            ConditionCheck: {
                TableName: process.env.ASSIGNMENTS_TABLE,
                Key: { orderId: id, workerId: scope.memberWorkerId(user) },
                ConditionExpression: 'attribute_exists(orderId)',
            },
        });
    }

    try {
        await database.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (err) {
        const reasons = (err && err.name === 'TransactionCanceledException' && err.CancellationReasons) || [];
        if (reasons.some((r) => r && r.Code === 'ConditionalCheckFailed')) throw errors.notFound();
        throw err;
    }

    logger.info('order updated', {
        orderId: id,
        status: order.status,
        assignmentsPut: puts.length,
        assignmentsRemoved: removed.length,
        statusChanged,
    });
    return http.ok(toOrderDetail(order, desired, lookups));
});
