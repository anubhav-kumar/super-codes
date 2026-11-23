'use strict';

/**
 * Member invoice scope (F-56). A member sees only invoices whose orderId is an order their linked
 * Worker is assigned to. Invoices with no orderId are never visible to members. Payments follow
 * their invoice.
 */

const { database } = require('common');
const scope = require('common/scope');
const { mapLimit } = require('./mapLimit');

const MAX_IN_FLIGHT = 16;

/** Newest invoice date first, then highest invoice number first. */
function byNewest(a, b) {
    return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0;
}

/** Every invoice item of the given order ids (Invoices byOrder, one Query per order), newest first. */
async function invoiceItemsOfOrders(orderIds) {
    const ids = [...orderIds];
    if (ids.length === 0) return [];
    const perOrder = await mapLimit(ids, MAX_IN_FLIGHT, (orderId) =>
        database.queryAll({
            TableName: process.env.INVOICES_TABLE,
            IndexName: 'byOrder',
            KeyConditionExpression: '#orderId = :orderId',
            ExpressionAttributeNames: { '#orderId': 'orderId' },
            ExpressionAttributeValues: { ':orderId': orderId },
        })
    );
    return perOrder.flat().sort(byNewest);
}

/** Every invoice item visible to the member, newest first. [] when no Worker is linked. */
async function visibleInvoiceItems(user, orderIds) {
    const ids = orderIds || (await scope.visibleOrderIds(user));
    return invoiceItemsOfOrders(ids);
}

/** True when a member may see this invoice item (it has an orderId and that order is visible). */
async function isInvoiceVisible(user, item) {
    return Boolean(item && item.orderId) && scope.isOrderVisible(user, item.orderId);
}

module.exports = { byNewest, visibleInvoiceItems, isInvoiceVisible };
