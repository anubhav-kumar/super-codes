'use strict';

/**
 * Read-time enrichment: orders store only ids of linked records. These helpers BatchGet the
 * linked People, Companies and Workers and build the API Order objects with current names.
 */

const { database, validators } = require('common');

const PERSON_FIELDS = ['name', 'isIndividualClient'];
const COMPANY_FIELDS = ['name'];
const WORKER_FIELDS = ['name', 'status', 'designation'];

/**
 * BatchGets the given ids. Returns { people, companies, workers }, each a Map id -> item.
 * personIds / companyIds / workerIds may contain duplicates or undefined.
 */
async function loadLookups({ personIds = [], companyIds = [], workerIds = [] }) {
    const [people, companies, workers] = await Promise.all([
        database.batchGetByIds(process.env.PEOPLE_TABLE, 'id', personIds, PERSON_FIELDS),
        database.batchGetByIds(process.env.COMPANIES_TABLE, 'id', companyIds, COMPANY_FIELDS),
        database.batchGetByIds(process.env.WORKERS_TABLE, 'id', workerIds, WORKER_FIELDS),
    ]);
    return { people, companies, workers };
}

/** Ids to look up for a set of order items and (optionally) their assignment items. */
function idsFor(orderItems, assignmentItems = []) {
    const personIds = [];
    const companyIds = [];
    const workerIds = [];
    for (const o of orderItems) {
        if (o.clientType === 'COMPANY') companyIds.push(o.clientId);
        else personIds.push(o.clientId);
        personIds.push(o.receivedFromId);
        if (o.primaryWorkerId) workerIds.push(o.primaryWorkerId);
    }
    for (const a of assignmentItems) workerIds.push(a.workerId);
    return { personIds, companyIds, workerIds };
}

/** Orders item -> API Order object (list item shape, no assignments). */
function toOrder(item, { people, companies, workers }) {
    const clientMap = item.clientType === 'COMPANY' ? companies : people;
    const client = clientMap.get(item.clientId);
    const receivedFrom = people.get(item.receivedFromId);
    const primary = item.primaryWorkerId ? workers.get(item.primaryWorkerId) : null;
    return {
        id: item.id,
        orderNumber: item.orderNumber,
        serviceName: item.serviceName,
        client: { type: item.clientType, id: item.clientId, name: client ? client.name : null },
        receivedFrom: { id: item.receivedFromId, name: receivedFrom ? receivedFrom.name : null },
        orderDate: item.orderDate,
        description: item.description ?? null,
        amount: validators.toInr(item.amountPaise ?? null),
        status: item.status,
        dueDate: item.dueDate ?? null,
        notes: item.notes ?? null,
        primaryOwner: item.primaryWorkerId
            ? {
                  id: item.primaryWorkerId,
                  name: primary ? primary.name : null,
                  status: primary ? primary.status : null,
              }
            : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

/** Assignment items -> API assignments, primary first, then by worker name, then id. */
function toAssignments(assignmentItems, workers) {
    return assignmentItems
        .map((a) => {
            const w = workers.get(a.workerId);
            return {
                workerId: a.workerId,
                workerName: w ? w.name : null,
                workerStatus: w ? w.status : null,
                workerDesignation: w ? w.designation ?? null : null,
                isPrimary: a.isPrimary === true,
                assignedDate: a.assignedDate,
            };
        })
        .sort((x, y) => {
            if (x.isPrimary !== y.isPrimary) return x.isPrimary ? -1 : 1;
            const nx = (x.workerName || '').toLowerCase();
            const ny = (y.workerName || '').toLowerCase();
            if (nx !== ny) return nx < ny ? -1 : 1;
            return x.workerId < y.workerId ? -1 : x.workerId > y.workerId ? 1 : 0;
        });
}

/** Orders item + its assignment items -> API Order detail. */
function toOrderDetail(item, assignmentItems, lookups) {
    return { ...toOrder(item, lookups), assignments: toAssignments(assignmentItems, lookups.workers) };
}

/** Enriches a page of order items (list route). */
async function enrichOrders(orderItems) {
    if (orderItems.length === 0) return [];
    const lookups = await loadLookups(idsFor(orderItems));
    return orderItems.map((o) => toOrder(o, lookups));
}

module.exports = { loadLookups, idsFor, toOrder, toOrderDetail, enrichOrders };
