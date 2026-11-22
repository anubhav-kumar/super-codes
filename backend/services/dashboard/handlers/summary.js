'use strict';

const { middleware, database, errors, http, validators } = require('common');
const { deriveInvoiceStatus } = require('../utils/invoiceStatus');
const { mapLimit } = require('../utils/mapLimit');

const OPEN_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'];
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

/**
 * GET /dashboard/summary?today=YYYY-MM-DD
 * Firm summary for Home: invoice and order counts/totals over all records, plus the 10 most overdue
 * invoices and the 10 most overdue open orders. Every overdue / due-soon decision uses `today`
 * (device local date when given, else today IST).
 * 200 summary, 400 VALIDATION_FAILED (today).
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const query = event.queryStringParameters || {};
    const today = parseToday(query.today);
    const dueSoonEnd = addDays(today, DUE_SOON_DAYS);

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
    let overdueOrderCount = 0;
    let dueSoonCount = 0;
    const overdueOrders = [];
    for (const item of orderItems) {
        if (!item.dueDate) continue;
        if (item.dueDate < today) {
            overdueOrderCount += 1;
            overdueOrders.push({ item, daysOverdue: daysBetween(item.dueDate, today) });
        } else if (item.dueDate <= dueSoonEnd) {
            dueSoonCount += 1;
        }
    }
    overdueOrders.sort(
        (a, b) =>
            b.daysOverdue - a.daysOverdue ||
            (Number(a.item.orderSeq) || 0) - (Number(b.item.orderSeq) || 0) ||
            String(a.item.orderNumber).localeCompare(String(b.item.orderNumber))
    );
    const topOrders = overdueOrders.slice(0, LIST_LIMIT);

    // One BatchGet round for the names of the listed items only.
    const personIds = [];
    const companyIds = [];
    const workerIds = [];
    for (const { item } of topInvoices) (item.billedToType === 'COMPANY' ? companyIds : personIds).push(item.billedToId);
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

    return http.ok({
        today,
        invoices: {
            outstandingTotal: validators.toInr(outstandingPaise),
            unpaidCount,
            overdueTotal: validators.toInr(overduePaise),
            overdueCount: overdueInvoiceCount,
        },
        orders: {
            overdueCount: overdueOrderCount,
            dueSoonCount,
        },
        overdueInvoices: topInvoices.map(({ item, derived, daysOverdue }) => ({
            id: item.id,
            invoiceNumber: item.invoiceNumber,
            billedTo: { type: item.billedToType, id: item.billedToId, name: nameOf(item.billedToType, item.billedToId) },
            dueDate: item.dueDate,
            daysOverdue,
            total: validators.toInr(Number(item.totalPaise) || 0),
            outstanding: validators.toInr(derived.outstandingPaise),
            displayedStatus: derived.displayedStatus,
        })),
        overdueOrders: topOrders.map(({ item, daysOverdue }) => {
            const owner = item.primaryWorkerId ? workers.get(item.primaryWorkerId) : null;
            return {
                id: item.id,
                orderNumber: item.orderNumber,
                serviceName: item.serviceName,
                client: { type: item.clientType, id: item.clientId, name: nameOf(item.clientType, item.clientId) },
                primaryOwner: item.primaryWorkerId
                    ? { id: item.primaryWorkerId, name: owner ? owner.name : null }
                    : null,
                dueDate: item.dueDate,
                daysOverdue,
                status: item.status,
            };
        }),
        generatedAt: new Date().toISOString(),
    });
});
