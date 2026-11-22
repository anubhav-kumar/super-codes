'use strict';

/**
 * Outstanding money per billed-to record for the People and Companies lists (F-29).
 * Reads billing's Invoices table (read-only, Query on the byBaseStatus GSI). Only ISSUED invoices
 * owe money; drafts and cancelled invoices are skipped by the key condition. An invoice counts only
 * for its own billedToId, so a person's outstanding never includes invoices billed to their company.
 */

const { database, validators } = require('common');
const { deriveInvoiceStatus } = require('./invoiceStatus');

/**
 * ids: person or company ids of the current page.
 * Returns Map id -> { outstandingPaise, hasOverdueInvoice } for ids that have ISSUED invoices.
 */
async function outstandingByBilledTo(ids) {
    const result = new Map();
    const wanted = new Set(ids);
    if (wanted.size === 0) return result;

    const items = await database.queryAll({
        TableName: process.env.INVOICES_TABLE,
        IndexName: 'byBaseStatus',
        KeyConditionExpression: '#baseStatus = :issued',
        ExpressionAttributeNames: {
            '#baseStatus': 'baseStatus',
            '#billedToId': 'billedToId',
            '#totalPaise': 'totalPaise',
            '#receivedPaise': 'receivedPaise',
            '#dueDate': 'dueDate',
        },
        ExpressionAttributeValues: { ':issued': 'ISSUED' },
        ProjectionExpression: '#billedToId, #baseStatus, #totalPaise, #receivedPaise, #dueDate',
    });

    const today = validators.todayIst();
    for (const item of items) {
        if (!wanted.has(item.billedToId)) continue;
        const { outstandingPaise, isOverdue } = deriveInvoiceStatus(item, today);
        const entry = result.get(item.billedToId) || { outstandingPaise: 0, hasOverdueInvoice: false };
        entry.outstandingPaise += outstandingPaise;
        if (isOverdue) entry.hasOverdueInvoice = true;
        result.set(item.billedToId, entry);
    }
    return result;
}

/** { outstanding (INR, 0 when none), hasOverdueInvoice } for one id. */
function outstandingFields(map, id) {
    const entry = map.get(id);
    return {
        outstanding: validators.toInr(entry ? entry.outstandingPaise : 0),
        hasOverdueInvoice: entry ? entry.hasOverdueInvoice : false,
    };
}

module.exports = { outstandingByBilledTo, outstandingFields };
