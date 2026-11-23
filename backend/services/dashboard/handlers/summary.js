'use strict';

const { middleware, database, errors, http, validators } = require('common');
const scope = require('common/scope');
const { deriveInvoiceStatus } = require('../utils/invoiceStatus');
const { mapLimit } = require('../utils/mapLimit');

const OPEN_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'];
const ALL_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];
const LIST_LIMIT = 10;
const DUE_SOON_DAYS = 7;
const TODAY_MESSAGE = 'today must be a date in the format YYYY-MM-DD';

const INVOICE_FIELDS = [
    'id',
    'invoiceNumber',
    'invoiceSeq',
    'billedToType',
    'billedToId',
    'dueDate',
    'totalPaise',
    'receivedPaise',
    'baseStatus',
];
const ORDER_FIELDS = [
    'id',
    'orderNumber',
    'orderSeq',
    'serviceName',
    'clientType',
    'clientId',
    'primaryWorkerId',
    'dueDate',
    'status',
];

/** ProjectionExpression params for a list of attribute names (reserved-word safe). */
function projection(fields) {
    const names = {};
    const expr = fields.map((f, i) => {
        names[`#f${i}`] = f;
        return `#f${i}`;
    });
    return { ProjectionExpression: expr.join(', '), names };
}

/** Optional ?today=YYYY-MM-DD (device local date). Missing or empty -> today IST. */
function parseToday(raw) {
    let today;
    try {
        today = validators.parseDate(raw);
    } catch (err) {
        if (!(err instanceof validators.FieldError)) throw err;
        throw errors.validationFailed([{ field: 'today', message: TODAY_MESSAGE }]);
    }
    return today === null ? validators.todayIst() : today;
}

function dayNumber(date) {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
}

function addDays(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from dueDate to today (>= 1 for an overdue item). */
function daysBetween(dueDate, today) {
    return Math.round(dayNumber(today) - dayNumber(dueDate));
}

async function issuedInvoices() {
    const { ProjectionExpression, names } = projection(INVOICE_FIELDS);
    return database.queryAll({
        TableName: process.env.INVOICES_TABLE,
        IndexName: 'byBaseStatus',
        KeyConditionExpression: '#baseStatus = :baseStatus',
        ExpressionAttributeNames: { ...names, '#baseStatus': 'baseStatus' },
        ExpressionAttributeValues: { ':baseStatus': 'ISSUED' },
        ProjectionExpression,
    });
}

async function openOrders() {
    const { ProjectionExpression, names } = projection(ORDER_FIELDS);
    const lists = await mapLimit(OPEN_STATUSES, OPEN_STATUSES.length, (status) =>
        database.queryAll({
            TableName: process.env.ORDERS_TABLE,
            IndexName: 'byStatus',
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: { ...names, '#status': 'status' },
            ExpressionAttributeValues: { ':status': status },
            ProjectionExpression,
        })
    );
    return lists.flat();
}

/** Member: every visible order (all statuses), with ORDER_FIELDS. [] when no Worker is linked. */
async function memberOrders(user) {
    const ids = await scope.visibleOrderIds(user);
    if (ids.size === 0) return [];
    const found = await database.batchGetByIds(process.env.ORDERS_TABLE, 'id', [...ids], ORDER_FIELDS);
    return [...found.values()];
}

/** Count of orders per status; every status key is always present. */
function countByStatus(items) {
    const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
    for (const item of items) if (Object.hasOwn(byStatus, item.status)) byStatus[item.status] += 1;
    return byStatus;
}

/** Overdue / due-soon counts and the 10 most overdue of the given open orders. */
function summarizeOrders(openItems, today, dueSoonEnd) {
    let overdueCount = 0;
    let dueSoonCount = 0;
    const overdue = [];
    for (const item of openItems) {
        if (!item.dueDate) continue;
        if (item.dueDate < today) {
            overdueCount += 1;
            overdue.push({ item, daysOverdue: daysBetween(item.dueDate, today) });
        } else if (item.dueDate <= dueSoonEnd) {
            dueSoonCount += 1;
        }
    }
    overdue.sort(
        (a, b) =>
            b.daysOverdue - a.daysOverdue ||
            (Number(a.item.orderSeq) || 0) - (Number(b.item.orderSeq) || 0) ||
            String(a.item.orderNumber).localeCompare(String(b.item.orderNumber))
    );
    return { overdueCount, dueSoonCount, topOrders: overdue.slice(0, LIST_LIMIT) };
}

/** One BatchGet round for the names of the listed items only. Returns { nameOf, workers }. */
async function loadNames(topInvoices, topOrders) {
    const personIds = [];
    const companyIds = [];
    const workerIds = [];
    for (const { item } of topInvoices) {
        (item.billedToType === 'COMPANY' ? companyIds : personIds).push(item.billedToId);
    }
    for (const { item } of topOrders) {
        (item.clientType === 'COMPANY' ? companyIds : personIds).push(item.clientId);
        if (item.primaryWorkerId) workerIds.push(item.primaryWorkerId);
    }
    const [people, companies, workers] = await Promise.all([
        database.batchGetByIds(process.env.PEOPLE_TABLE, 'id', personIds, ['name']),
        database.batchGetByIds(process.env.COMPANIES_TABLE, 'id', companyIds, ['name']),
        database.batchGetByIds(process.env.WORKERS_TABLE, 'id', workerIds, ['name']),
    ]);
    const nameOf = (type, id) => {
        const rec = (type === 'COMPANY' ? companies : people).get(id);
        return rec ? rec.name : null;
    };
    return { nameOf, workers };
}

function toOverdueOrder({ item, daysOverdue }, { nameOf, workers }) {
    const owner = item.primaryWorkerId ? workers.get(item.primaryWorkerId) : null;
    return {
        id: item.id,
        orderNumber: item.orderNumber,
        serviceName: item.serviceName,
        client: { type: item.clientType, id: item.clientId, name: nameOf(item.clientType, item.clientId) },
        primaryOwner: item.primaryWorkerId ? { id: item.primaryWorkerId, name: owner ? owner.name : null } : null,
        dueDate: item.dueDate,
        daysOverdue,
        status: item.status,
    };
}

/**
 * Member home (FR1 decision 10): only the member's own orders (assigned to their linked Worker).
 * No firm money: invoices null, overdueInvoices []; Invoices are never queried. No Worker: zeros.
 */
async function memberSummary(user, today, dueSoonEnd) {
    const items = await memberOrders(user);
    const open = items.filter((i) => OPEN_STATUSES.includes(i.status));
    const { overdueCount, dueSoonCount, topOrders } = summarizeOrders(open, today, dueSoonEnd);
    const names = await loadNames([], topOrders);
    return {
        today,
        scope: 'MEMBER',
        invoices: null,
        orders: { overdueCount, dueSoonCount, byStatus: countByStatus(items) },
        overdueInvoices: [],
        overdueOrders: topOrders.map((o) => toOverdueOrder(o, names)),
        generatedAt: new Date().toISOString(),
    };
}

/**
 * GET /dashboard/summary?today=YYYY-MM-DD
 * Admin: firm summary for Home: invoice and order counts/totals over all records, plus the 10 most
 * overdue invoices and the 10 most overdue open orders; scope "FIRM", orders.byStatus null.
 * Member: scope "MEMBER", own orders only (see memberSummary).
 * Every overdue / due-soon decision uses `today` (device local date when given, else today IST).
 * 200 summary, 400 VALIDATION_FAILED (today).
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const query = event.queryStringParameters || {};
    const today = parseToday(query.today);
    const dueSoonEnd = addDays(today, DUE_SOON_DAYS);

    if (scope.isMember(user)) return http.ok(await memberSummary(user, today, dueSoonEnd));

    const [invoiceItems, orderItems] = await Promise.all([issuedInvoices(), openOrders()]);

    // Invoices: ISSUED only (the query), derived with the same `today`.
    let outstandingPaise = 0;
    let unpaidCount = 0;
    let overduePaise = 0;
    let overdueInvoiceCount = 0;
    const overdueInvoices = [];
    for (const item of invoiceItems) {
        const derived = deriveInvoiceStatus(item, today);
        if (derived.outstandingPaise > 0) {
            outstandingPaise += derived.outstandingPaise;
            unpaidCount += 1;
        }
        if (derived.isOverdue) {
            overduePaise += derived.outstandingPaise;
            overdueInvoiceCount += 1;
            overdueInvoices.push({ item, derived, daysOverdue: daysBetween(item.dueDate, today) });
        }
    }
    overdueInvoices.sort(
        (a, b) =>
            b.daysOverdue - a.daysOverdue ||
            b.derived.outstandingPaise - a.derived.outstandingPaise ||
            (Number(a.item.invoiceSeq) || 0) - (Number(b.item.invoiceSeq) || 0) ||
            String(a.item.invoiceNumber).localeCompare(String(b.item.invoiceNumber))
    );
    const topInvoices = overdueInvoices.slice(0, LIST_LIMIT);

    // Orders: open only (the queries); orders without dueDate are never overdue or due soon.
    const orders = summarizeOrders(orderItems, today, dueSoonEnd);
    const { topOrders } = orders;

    const names = await loadNames(topInvoices, topOrders);

    return http.ok({
        today,
        scope: 'FIRM',
        invoices: {
            outstandingTotal: validators.toInr(outstandingPaise),
            unpaidCount,
            overdueTotal: validators.toInr(overduePaise),
            overdueCount: overdueInvoiceCount,
        },
        orders: {
            overdueCount: orders.overdueCount,
            dueSoonCount: orders.dueSoonCount,
            byStatus: null,
        },
        overdueInvoices: topInvoices.map(({ item, derived, daysOverdue }) => ({
            id: item.id,
            invoiceNumber: item.invoiceNumber,
            billedTo: {
                type: item.billedToType,
                id: item.billedToId,
                name: names.nameOf(item.billedToType, item.billedToId),
            },
            dueDate: item.dueDate,
            daysOverdue,
            total: validators.toInr(Number(item.totalPaise) || 0),
            outstanding: validators.toInr(derived.outstandingPaise),
            displayedStatus: derived.displayedStatus,
        })),
        overdueOrders: topOrders.map((o) => toOverdueOrder(o, names)),
        generatedAt: new Date().toISOString(),
    });
});
