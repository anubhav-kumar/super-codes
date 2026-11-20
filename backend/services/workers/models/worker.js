'use strict';

const { validators } = require('common');

const ENTITY = 'WORKER';

/**
 * Builds the stored item from validated fields. Optional fields that are null are left out
 * (absent attribute). status is always set because it is the byStatus GSI key.
 */
function toItem(id, fields, { createdAt, updatedAt }) {
    const item = {
        id,
        name: fields.name,
        designation: fields.designation,
        status: fields.status,
        entity: ENTITY,
        nameSort: validators.nameSort(fields.name, id),
        createdAt,
        updatedAt,
    };
    for (const key of ['email', 'phone', 'joiningDate', 'notes']) {
        if (fields[key] !== null && fields[key] !== undefined) item[key] = fields[key];
    }
    return item;
}

/** Stored item -> API Worker object. */
function toWorker(item) {
    return {
        id: item.id,
        name: item.name,
        email: item.email ?? null,
        phone: item.phone ?? null,
        designation: item.designation,
        joiningDate: item.joiningDate ?? null,
        status: item.status,
        notes: item.notes ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

module.exports = { ENTITY, toItem, toWorker };
