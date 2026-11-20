'use strict';

const { errors, validators } = require('common');

const { check, normalizeString, parsePan, parseEmail, parsePhone, isUuidV4 } = validators;

/**
 * Validates a person create (withId) or update body. Collects every failing field and throws
 * 400 VALIDATION_FAILED once. Returns normalized fields; optional empty values are null.
 */
function parsePersonBody(body, { withId }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const details = [];
    const out = {};

    if (withId) {
        if (!isUuidV4(body.id)) details.push({ field: 'id', message: 'id must be a lowercase UUID v4' });
        else out.id = body.id;
    }

    out.name = check(details, 'name', () => normalizeString(body.name, { min: 1, max: 100, label: 'Name' }), {
        required: true,
        requiredMessage: 'Name is required',
    });

    if (typeof body.isIndividualClient !== 'boolean') {
        details.push({ field: 'isIndividualClient', message: 'isIndividualClient must be true or false' });
    } else {
        out.isIndividualClient = body.isIndividualClient;
    }

    const panDetailsBefore = details.length;
    out.pan = check(details, 'pan', () => parsePan(body.pan));
    if (out.isIndividualClient === true && out.pan === null && details.length === panDetailsBefore) {
        details.push({ field: 'pan', message: 'PAN is required for individual clients' });
    }

    out.email = check(details, 'email', () => parseEmail(body.email));
    out.phone = check(details, 'phone', () => parsePhone(body.phone));
    out.address = check(details, 'address', () => normalizeString(body.address, { max: 500, label: 'Address' }));
    out.notes = check(details, 'notes', () => normalizeString(body.notes, { max: 2000, label: 'Notes' }));

    if (details.length) throw errors.validationFailed(details);
    return out;
}

module.exports = { parsePersonBody };
