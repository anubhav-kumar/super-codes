'use strict';

const { validators, errors } = require('common');

const DESIGNATIONS = ['ARTICLE', 'ASSOCIATE', 'TRAINEE', 'MANAGER', 'OTHER'];
const STATUSES = ['ACTIVE', 'INACTIVE'];

const { check, normalizeString, parseEmail, parsePhone, parseDate, parseEnum, isUuidV4 } = validators;

/**
 * Validates a create (isCreate) or update body and returns the normalized editable fields.
 * Optional fields come back as null when omitted or empty. Throws 400 VALIDATION_FAILED listing
 * every failing field.
 */
function parseWorker(body, { isCreate }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const details = [];
    const out = {};

    if (isCreate) {
        if (!isUuidV4(body.id)) details.push({ field: 'id', message: 'id must be a lowercase UUID v4' });
        else out.id = body.id;
    }

    out.name = check(details, 'name', () => normalizeString(body.name, { min: 1, max: 100, label: 'Name' }), {
        required: true,
        requiredMessage: 'Name is required',
    });
    out.email = check(details, 'email', () => parseEmail(body.email));
    out.phone = check(details, 'phone', () => parsePhone(body.phone));
    out.designation = check(details, 'designation', () => parseEnum(body.designation, DESIGNATIONS, 'Designation'), {
        required: true,
        requiredMessage: 'Designation is required',
    });
    out.joiningDate = check(details, 'joiningDate', () => parseDate(body.joiningDate));
    // Create: status optional, default ACTIVE. Update: status required.
    out.status = check(details, 'status', () => parseEnum(body.status, STATUSES, 'Status'), {
        required: !isCreate,
        requiredMessage: 'Status is required',
    });
    if (isCreate && out.status === null) out.status = 'ACTIVE';
    out.notes = check(details, 'notes', () => normalizeString(body.notes, { max: 2000, label: 'Notes' }));

    if (details.length) throw errors.validationFailed(details);
    return out;
}

module.exports = { parseWorker, DESIGNATIONS, STATUSES };
