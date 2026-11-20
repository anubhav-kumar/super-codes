'use strict';

const { validators, errors } = require('common');

const STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];
const CLIENT_TYPES = ['PERSON', 'COMPANY'];
const MAX_ASSIGNMENTS = 20;

const { check, normalizeString, parseDate, parseMoney, parseEnum, isUuidV4, todayIst } = validators;

function parseReferenceId(details, field, value, requiredMessage) {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        details.push({ field, message: requiredMessage });
        return undefined;
    }
    if (!isUuidV4(value)) {
        details.push({ field, message: `${field} must be a lowercase UUID v4` });
        return undefined;
    }
    return value;
}

/** Validates the assignment input list. Returns [{ workerId, isPrimary }]. */
function parseAssignments(details, value, { required }) {
    if (value === undefined || value === null) {
        if (required) details.push({ field: 'assignments', message: 'Assignments are required (send [] for none)' });
        return [];
    }
    if (!Array.isArray(value)) {
        details.push({ field: 'assignments', message: 'Assignments must be a list' });
        return [];
    }
    if (value.length > MAX_ASSIGNMENTS) {
        details.push({ field: 'assignments', message: `At most ${MAX_ASSIGNMENTS} workers can be assigned` });
        return [];
    }

    const out = [];
    const seen = new Set();
    let itemErrors = false;
    value.forEach((a, i) => {
        if (!a || typeof a !== 'object' || Array.isArray(a)) {
            details.push({ field: `assignments[${i}]`, message: 'Each assignment must be an object' });
            itemErrors = true;
            return;
        }
        const workerId = parseReferenceId(details, `assignments[${i}].workerId`, a.workerId, 'Worker is required');
        let isPrimary = false;
        if (a.isPrimary !== undefined && a.isPrimary !== null) {
            if (typeof a.isPrimary !== 'boolean') {
                details.push({ field: `assignments[${i}].isPrimary`, message: 'isPrimary must be true or false' });
                itemErrors = true;
            } else {
                isPrimary = a.isPrimary;
            }
        }
        if (workerId === undefined) {
            itemErrors = true;
            return;
        }
        if (seen.has(workerId)) {
            details.push({ field: `assignments[${i}].workerId`, message: 'This worker is already assigned' });
            itemErrors = true;
            return;
        }
        seen.add(workerId);
        out.push({ workerId, isPrimary });
    });

    if (!itemErrors && out.length > 0 && out.filter((a) => a.isPrimary).length !== 1) {
        details.push({ field: 'assignments', message: 'Choose exactly one primary owner' });
    }
    return out;
}

/**
 * Validates a create (isCreate) or update body and returns normalized fields:
 * { id?, serviceName, clientType, clientId, receivedFromId, orderDate, description, amountPaise,
 *   status, dueDate, notes, assignments }.
 * Create: status is ignored (always NEW), orderDate defaults to today IST, assignments default [].
 * Update: status, orderDate and assignments are required.
 * Throws 400 VALIDATION_FAILED listing every failing field.
 */
function parseOrder(body, { isCreate }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const details = [];
    const out = {};

    if (isCreate) {
        if (!isUuidV4(body.id)) details.push({ field: 'id', message: 'id must be a lowercase UUID v4' });
        else out.id = body.id;
    }

    out.serviceName = check(
        details,
        'serviceName',
        () => normalizeString(body.serviceName, { min: 1, max: 100, label: 'Service name' }),
        { required: true, requiredMessage: 'Service name is required' }
    );
    out.clientType = check(details, 'clientType', () => parseEnum(body.clientType, CLIENT_TYPES, 'Client type'), {
        required: true,
        requiredMessage: 'Client type is required',
    });
    out.clientId = parseReferenceId(details, 'clientId', body.clientId, 'Client is required');
    out.receivedFromId = parseReferenceId(details, 'receivedFromId', body.receivedFromId, 'Received from is required');
    out.orderDate = check(details, 'orderDate', () => parseDate(body.orderDate), {
        required: !isCreate,
        requiredMessage: 'Order date is required',
    });
    if (isCreate && out.orderDate === null) out.orderDate = todayIst();
    out.description = check(details, 'description', () =>
        normalizeString(body.description, { max: 2000, label: 'Description' })
    );
    out.amountPaise = check(details, 'amount', () => parseMoney(body.amount));
    if (isCreate) {
        out.status = 'NEW';
    } else {
        out.status = check(details, 'status', () => parseEnum(body.status, STATUSES, 'Status'), {
            required: true,
            requiredMessage: 'Status is required',
        });
    }
    out.dueDate = check(details, 'dueDate', () => parseDate(body.dueDate));
    out.notes = check(details, 'notes', () => normalizeString(body.notes, { max: 2000, label: 'Notes' }));
    out.assignments = parseAssignments(details, body.assignments, { required: !isCreate });

    if (details.length) throw errors.validationFailed(details);
    return out;
}

module.exports = { parseOrder, STATUSES, CLIENT_TYPES };
