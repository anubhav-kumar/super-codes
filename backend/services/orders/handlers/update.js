'use strict';

const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const { parseOrder } = require('../validators/order');
const { buildOrderItem, getOrder, getAssignments, checkReferences } = require('../models/order');
const { toOrderDetail } = require('../utils/enrich');

/**
 * PUT /orders/{id}   full editable field set, including the full desired assignments list
 * 200 Order detail
 * 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND, 400 CLIENT_NOT_ELIGIBLE (only when the client
 * changed), 404 NOT_FOUND, 409 WORKER_INACTIVE (only for workers not already on this order)
 *
 * orderNumber never changes. Already assigned workers keep their assignedDate (even if inactive);
 * removed assignments are deleted; new ones get today (IST). One TransactWriteItems:
 * Put order (attribute_exists(id)) + Put new/changed assignments + Delete removed ones.
 */
module.exports.handler = middleware.withHandler(async ({ event, body }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const fields = parseOrder(body, { isCreate: false });

    const existing = await getOrder(id, { consistent: true });
    if (!existing) throw errors.notFound();

    const current = await getAssignments(id, { consistent: true });
    const currentByWorker = new Map(current.map((a) => [a.workerId, a]));

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

    try {
        await database.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (err) {
        const reasons = (err && err.name === 'TransactionCanceledException' && err.CancellationReasons) || [];
        if (reasons[0] && reasons[0].Code === 'ConditionalCheckFailed') throw errors.notFound();
        throw err;
    }

    logger.info('order updated', {
        orderId: id,
        status: order.status,
        assignmentsPut: puts.length,
        assignmentsRemoved: removed.length,
    });
    return http.ok(toOrderDetail(order, desired, lookups));
});
