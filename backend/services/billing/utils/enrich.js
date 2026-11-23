'use strict';

/**
 * Read-time enrichment: invoices store only ids of linked records. These helpers BatchGet the
 * billed-to People/Companies and the related Orders and build the API Invoice objects with
 * current names and order numbers.
 */

const { database, validators } = require('common');
const { deriveInvoiceStatus } = require('./invoiceStatus');

/**
 * BatchGets the given ids. Returns { people, companies, orders }, each a Map id -> item.
 * Arrays may contain duplicates or undefined.
 */
async function loadLookups({ personIds = [], companyIds = [], orderIds = [] }) {
    const [people, companies, orders] = await Promise.all([
        database.batchGetByIds(process.env.PEOPLE_TABLE, 'id', personIds, ['name']),
        database.batchGetByIds(process.env.COMPANIES_TABLE, 'id', companyIds, ['name']),
        database.batchGetByIds(process.env.ORDERS_TABLE, 'id', orderIds, ['orderNumber']),
    ]);
    return { people, companies, orders };
}

/** Ids to look up for a set of invoice items. */
function idsFor(invoiceItems) {
    const personIds = [];
    const companyIds = [];
    const orderIds = [];
    for (const inv of invoiceItems) {
        if (inv.billedToType === 'COMPANY') companyIds.push(inv.billedToId);
        else personIds.push(inv.billedToId);
        if (inv.orderId) orderIds.push(inv.orderId);
    }
    return { personIds, companyIds, orderIds };
}

/**
 * billedTo.canOpen: true for admins (clients null); for a member (clients = common/scope
 * visibleClients result) only when the billed-to party is one of their visible clients.
 */
function canOpenBilledTo(item, clients) {
    if (!clients) return true;
    return (item.billedToType === 'COMPANY' ? clients.companyIds : clients.personIds).has(item.billedToId);
}

/** Invoices item -> API Invoice object (list item shape, no payments). */
function toInvoice(item, { people, companies, orders }, today = validators.todayIst(), clients = null) {
    const billedTo = (item.billedToType === 'COMPANY' ? companies : people).get(item.billedToId);
    const order = item.orderId ? orders.get(item.orderId) : null;
    const derived = deriveInvoiceStatus(item, today);
    return {
        id: item.id,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate,
        dueDate: item.dueDate,
        billedTo: {
            type: item.billedToType,
            id: item.billedToId,
            name: billedTo ? billedTo.name : null,
            canOpen: canOpenBilledTo(item, clients),
        },
        order: item.orderId ? { id: item.orderId, orderNumber: order ? order.orderNumber : null } : null,
        description: item.description ?? null,
        amount: validators.toInr(item.amountPaise),
        tax: validators.toInr(item.taxPaise),
        total: validators.toInr(item.totalPaise),
        baseStatus: item.baseStatus,
        amountReceived: validators.toInr(derived.receivedPaise),
        outstanding: validators.toInr(derived.outstandingPaise),
        displayedStatus: derived.displayedStatus,
        isOverdue: derived.isOverdue,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

/** Payments item -> API Payment object. */
function toPayment(item) {
    return {
        id: item.id,
        invoiceId: item.invoiceId,
        paymentNumber: item.paymentNumber,
        link: item.link ?? null,
        amount: validators.toInr(item.amountPaise),
        createdDate: item.createdDate,
        expiryDate: item.expiryDate ?? null,
        status: item.status,
        paymentDate: item.paymentDate ?? null,
        transactionReference: item.transactionReference ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

/**
 * Invoices item + its payment items -> API Invoice detail (payments by paymentSeq ascending).
 * `clients`: see canOpenBilledTo (null for admins).
 */
function toInvoiceDetail(item, paymentItems, lookups, clients = null) {
    const payments = [...paymentItems]
        .sort((a, b) => (Number(a.paymentSeq) || 0) - (Number(b.paymentSeq) || 0))
        .map(toPayment);
    return { ...toInvoice(item, lookups, validators.todayIst(), clients), payments };
}

/** Enriches invoice items (list route). `clients`: see canOpenBilledTo (null for admins). */
async function enrichInvoices(invoiceItems, clients = null) {
    if (invoiceItems.length === 0) return [];
    const lookups = await loadLookups(idsFor(invoiceItems));
    const today = validators.todayIst();
    return invoiceItems.map((inv) => toInvoice(inv, lookups, today, clients));
}

module.exports = { loadLookups, idsFor, toInvoice, toPayment, toInvoiceDetail, enrichInvoices };
