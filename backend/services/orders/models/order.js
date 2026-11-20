'use strict';

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { database, errors } = require('common');
const { loadLookups, idsFor, toOrderDetail } = require('../utils/enrich');

const ENTITY = 'ORDER';
const ORDER_COUNTER = 'ORDER';

function orderNumber(seq) {
    return `ORD-${String(seq).padStart(4, '0')}`;
}

/** <orderDate>#<seq padded to 10>, so string order equals date then numeric order. */
function sortKey(orderDate, seq) {
    return `${orderDate}#${String(seq).padStart(10, '0')}`;
}

/**
 * Builds the full Orders item. Null optional fields are left out (absent attributes);
 * primaryWorkerId is absent when there are no assignments.
 */
function buildOrderItem(id, seq, fields, { createdAt, updatedAt }) {
    const primary = fields.assignments.find((a) => a.isPrimary);
    const item = {
        id,
        orderNumber: orderNumber(seq),
        orderSeq: seq,
        serviceName: fields.serviceName,
        clientType: fields.clientType,
        clientId: fields.clientId,
        receivedFromId: fields.receivedFromId,
        orderDate: fields.orderDate,
        status: fields.status,
        entity: ENTITY,
        sortKey: sortKey(fields.orderDate, seq),
        createdAt,
        updatedAt,
    };
    if (fields.description !== null && fields.description !== undefined) item.description = fields.description;
    if (fields.amountPaise !== null && fields.amountPaise !== undefined) item.amountPaise = fields.amountPaise;
    if (fields.dueDate !== null && fields.dueDate !== undefined) item.dueDate = fields.dueDate;
    if (fields.notes !== null && fields.notes !== undefined) item.notes = fields.notes;
    if (primary) item.primaryWorkerId = primary.workerId;
    return item;
}

async function getOrder(id, { consistent = false } = {}) {
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.ORDERS_TABLE, Key: { id }, ConsistentRead: consistent })
    );
    return res.Item || null;
}

async function getAssignments(orderId, { consistent = false } = {}) {
    return database.queryAll({
        TableName: process.env.ASSIGNMENTS_TABLE,
        KeyConditionExpression: 'orderId = :orderId',
        ExpressionAttributeValues: { ':orderId': orderId },
        ConsistentRead: consistent,
    });
}

/** Increments the ORDER counter and returns the new sequence number (first call gives 1). */
async function nextOrderSeq() {
    const res = await database.doc.send(
        new UpdateCommand({
            TableName: process.env.COUNTERS_TABLE,
            Key: { name: ORDER_COUNTER },
            UpdateExpression: 'ADD #seq :one',
            ExpressionAttributeNames: { '#seq': 'seq' },
            ExpressionAttributeValues: { ':one': 1 },
            ReturnValues: 'UPDATED_NEW',
        })
    );
    return Number(res.Attributes.seq);
}

/** Reads an order's assignments and linked records and returns the API Order detail. */
async function loadOrderDetail(item, { consistent = false } = {}) {
    const assignments = await getAssignments(item.id, { consistent });
    const lookups = await loadLookups(idsFor([item], assignments));
    return toOrderDetail(item, assignments, lookups);
}

/**
 * Checks the client, receivedFrom and assigned workers exist, in that order of errors:
 *   400 REFERENCE_NOT_FOUND (all missing references in one error),
 *   400 CLIENT_NOT_ELIGIBLE (only when checkEligibility),
 *   409 WORKER_INACTIVE (inactive workers not in alreadyAssigned).
 * Returns the lookups ({ people, companies, workers }) for building the response.
 */
async function checkReferences(fields, { checkEligibility = true, alreadyAssigned = new Set() } = {}) {
    const lookups = await loadLookups({
        personIds: [fields.receivedFromId, fields.clientType === 'PERSON' ? fields.clientId : undefined],
        companyIds: [fields.clientType === 'COMPANY' ? fields.clientId : undefined],
        workerIds: fields.assignments.map((a) => a.workerId),
    });
    const { people, companies, workers } = lookups;

    const missing = [];
    const client = (fields.clientType === 'COMPANY' ? companies : people).get(fields.clientId);
    if (!client) missing.push({ field: 'clientId', message: 'This client does not exist' });
    if (!people.has(fields.receivedFromId)) {
        missing.push({ field: 'receivedFromId', message: 'This person does not exist' });
    }
    fields.assignments.forEach((a, i) => {
        if (!workers.has(a.workerId)) {
            missing.push({ field: `assignments[${i}].workerId`, message: 'This worker does not exist' });
        }
    });
    if (missing.length) throw errors.referenceNotFound(missing);

    if (checkEligibility && fields.clientType === 'PERSON' && client.isIndividualClient !== true) {
        throw new errors.ApiError(400, 'CLIENT_NOT_ELIGIBLE', 'The client must be an individual client or a company', [
            { field: 'clientId', message: 'The client must be an individual client or a company' },
        ]);
    }

    const inactive = [];
    fields.assignments.forEach((a, i) => {
        const w = workers.get(a.workerId);
        if (!alreadyAssigned.has(a.workerId) && w.status !== 'ACTIVE') {
            inactive.push({ field: `assignments[${i}].workerId`, message: `${w.name} is inactive` });
        }
    });
    if (inactive.length) throw errors.conflict('WORKER_INACTIVE', 'Inactive workers cannot be assigned', inactive);

    return lookups;
}

module.exports = {
    ENTITY,
    buildOrderItem,
    getOrder,
    getAssignments,
    nextOrderSeq,
    loadOrderDetail,
    checkReferences,
};
