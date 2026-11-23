'use strict';

const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, validators, http, logger } = require('common');
const { parseOrder } = require('../validators/order');
const { buildOrderItem, getOrder, nextOrderSeq, loadOrderDetail, checkReferences } = require('../models/order');
const { toOrderDetail } = require('../utils/enrich');

/**
 * POST /orders
 * 201 Order detail (status NEW, orderNumber assigned)
 * 200 Order detail when an order with this id already exists (nothing written)
 * 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND, 400 CLIENT_NOT_ELIGIBLE, 409 WORKER_INACTIVE
 * Admin only: a member gets 404 NOT_FOUND.
 *
 * Flow: validate -> GetItem id -> check references -> increment counter -> one TransactWriteItems
 * (order with attribute_not_exists(id) + each assignment). A counter number lost to a failed or
 * raced write leaves a gap in the sequence (accepted).
 */
module.exports.handler = middleware.withHandler(async ({ body }) => {
    const fields = parseOrder(body, { isCreate: true });
    const { id } = fields;

    const existing = await getOrder(id, { consistent: true });
    if (existing) return http.ok(await loadOrderDetail(existing, { consistent: true }));

    const lookups = await checkReferences(fields);

    const seq = await nextOrderSeq();
    const now = new Date().toISOString();
    const today = validators.todayIst();
    const order = buildOrderItem(id, seq, fields, { createdAt: now, updatedAt: now });
    const assignments = fields.assignments.map((a) => ({
        orderId: id,
        workerId: a.workerId,
        isPrimary: a.isPrimary,
        assignedDate: today,
        createdAt: now,
        updatedAt: now,
    }));

    const transactItems = [
        { Put: { TableName: process.env.ORDERS_TABLE, Item: order, ConditionExpression: 'attribute_not_exists(id)' } },
        ...assignments.map((item) => ({ Put: { TableName: process.env.ASSIGNMENTS_TABLE, Item: item } })),
    ];

    try {
        await database.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (err) {
        const reasons = (err && err.name === 'TransactionCanceledException' && err.CancellationReasons) || [];
        if (reasons[0] && reasons[0].Code === 'ConditionalCheckFailed') {
            const raced = await getOrder(id, { consistent: true });
            if (raced) return http.ok(await loadOrderDetail(raced, { consistent: true }));
        }
        throw err;
    }

    logger.info('order created', { orderId: id, orderNumber: order.orderNumber, assignments: assignments.length });
    return http.created(toOrderDetail(order, assignments, lookups));
}, { adminOnly: true });
