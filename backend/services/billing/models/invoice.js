'use strict';

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { database, errors } = require('common');
const { loadLookups, idsFor, toInvoiceDetail } = require('../utils/enrich');

const ENTITY = 'INVOICE';
const INVOICE_COUNTER = 'INVOICE';

function invoiceNumber(seq) {
    return `INV-${String(seq).padStart(4, '0')}`;
}

/** <date>#<seq padded to 10>, so string order equals date then numeric order. */
function dateSeqKey(date, seq) {
    return `${date}#${String(seq).padStart(10, '0')}`;
}

/**
 * Builds a new Invoices item. receivedPaise starts at 0 (only payment writes change it).
 * Null optional fields (orderId, description) are left out (absent attributes).
 */
function buildNewInvoiceItem(id, seq, fields, now) {
    const item = {
        id,
        invoiceNumber: invoiceNumber(seq),
        invoiceSeq: seq,
        invoiceDate: fields.invoiceDate,
        dueDate: fields.dueDate,
        billedToType: fields.billedToType,
        billedToId: fields.billedToId,
        amountPaise: fields.amountPaise,
        taxPaise: fields.taxPaise,
        totalPaise: fields.totalPaise,
        baseStatus: fields.baseStatus,
        receivedPaise: 0,
        entity: ENTITY,
        sortKey: dateSeqKey(fields.invoiceDate, seq),
        dueSortKey: dateSeqKey(fields.dueDate, seq),
        createdAt: now,
        updatedAt: now,
    };
    if (fields.orderId) item.orderId = fields.orderId;
    if (fields.description !== null && fields.description !== undefined) item.description = fields.description;
    return item;
}

async function getInvoice(id, { consistent = false } = {}) {
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.INVOICES_TABLE, Key: { id }, ConsistentRead: consistent })
    );
    return res.Item || null;
}

async function getPayments(invoiceId, { consistent = false } = {}) {
    return database.queryAll({
        TableName: process.env.PAYMENTS_TABLE,
        KeyConditionExpression: 'invoiceId = :invoiceId',
        ExpressionAttributeValues: { ':invoiceId': invoiceId },
        ConsistentRead: consistent,
    });
}

/** Increments the INVOICE counter and returns the new sequence number (first call gives 1). */
async function nextInvoiceSeq() {
    const res = await database.doc.send(
        new UpdateCommand({
            TableName: process.env.COUNTERS_TABLE,
            Key: { name: INVOICE_COUNTER },
            UpdateExpression: 'ADD #seq :one',
            ExpressionAttributeNames: { '#seq': 'seq' },
            ExpressionAttributeValues: { ':one': 1 },
            ReturnValues: 'UPDATED_NEW',
        })
    );
    return Number(res.Attributes.seq);
}

/**
 * Updates the editable fields of an existing invoice with UpdateItem (so receivedPaise, written
 * by payment writes, is never overwritten). REMOVEs orderId / description when null.
 * Returns the full new item, or null when the invoice does not exist.
 */
async function updateInvoiceItem(existing, fields, now) {
    const seq = existing.invoiceSeq;
    const set = {
        invoiceDate: fields.invoiceDate,
        dueDate: fields.dueDate,
        billedToType: fields.billedToType,
        billedToId: fields.billedToId,
        amountPaise: fields.amountPaise,
        taxPaise: fields.taxPaise,
        totalPaise: fields.totalPaise,
        baseStatus: fields.baseStatus,
        sortKey: dateSeqKey(fields.invoiceDate, seq),
        dueSortKey: dateSeqKey(fields.dueDate, seq),
        updatedAt: now,
    };
    const remove = [];
    if (fields.orderId) set.orderId = fields.orderId;
    else remove.push('orderId');
    if (fields.description !== null && fields.description !== undefined) set.description = fields.description;
    else remove.push('description');

    const names = {};
    const values = {};
    const setParts = Object.entries(set).map(([attr, value], i) => {
        names[`#s${i}`] = attr;
        values[`:s${i}`] = value;
        return `#s${i} = :s${i}`;
    });
    const removeParts = remove.map((attr, i) => {
        names[`#r${i}`] = attr;
        return `#r${i}`;
    });
    names['#id'] = 'id';

    let expression = `SET ${setParts.join(', ')}`;
    if (removeParts.length) expression += ` REMOVE ${removeParts.join(', ')}`;

    try {
        const res = await database.doc.send(
            new UpdateCommand({
                TableName: process.env.INVOICES_TABLE,
                Key: { id: existing.id },
                UpdateExpression: expression,
                ConditionExpression: 'attribute_exists(#id)',
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
                ReturnValues: 'ALL_NEW',
            })
        );
        return res.Attributes;
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') return null;
        throw err;
    }
}

/**
 * Checks billedToId exists in People or Companies (per billedToType) and orderId (when given)
 * exists in Orders. Throws 400 REFERENCE_NOT_FOUND listing all missing references.
 * Returns the lookups ({ people, companies, orders }) for building the response.
 */
async function checkReferences(fields) {
    const lookups = await loadLookups(idsFor([fields]));
    const billedToMap = fields.billedToType === 'COMPANY' ? lookups.companies : lookups.people;

    const missing = [];
    if (!billedToMap.has(fields.billedToId)) {
        missing.push({
            field: 'billedToId',
            message: fields.billedToType === 'COMPANY' ? 'This company does not exist' : 'This person does not exist',
        });
    }
    if (fields.orderId && !lookups.orders.has(fields.orderId)) {
        missing.push({ field: 'orderId', message: 'This order does not exist' });
    }
    if (missing.length) throw errors.referenceNotFound(missing);
    return lookups;
}

/** Reads an invoice's payments and linked records and returns the API Invoice detail. */
async function loadInvoiceDetail(item, { consistent = false } = {}) {
    const [payments, lookups] = await Promise.all([
        getPayments(item.id, { consistent }),
        loadLookups(idsFor([item])),
    ]);
    return toInvoiceDetail(item, payments, lookups);
}

module.exports = {
    ENTITY,
    buildNewInvoiceItem,
    getInvoice,
    getPayments,
    nextInvoiceSeq,
    updateInvoiceItem,
    checkReferences,
    loadInvoiceDetail,
};
