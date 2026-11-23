'use strict';

const { validators, errors } = require('common');

const STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];
const MAX_TEXT = 5000;

const { check, parseEnum, isUuidV4 } = validators;

/** Comment text: trimmed, 1-5,000 characters. Pushes a detail and returns undefined when invalid. */
function parseText(details, value) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
        details.push({ field: 'text', message: 'Comment must be text' });
        return undefined;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') {
        details.push({ field: 'text', message: 'Comment is required' });
        return undefined;
    }
    if (text.length > MAX_TEXT) {
        details.push({ field: 'text', message: 'Comment can be at most 5,000 characters' });
        return undefined;
    }
    return text;
}

/**
 * Validates a comment body and returns normalized fields.
 * Create (isCreate): { id, text, status } where status is one of STATUSES or null (plain comment).
 * Edit: { text } only; any other key is ignored.
 * Throws 400 VALIDATION_FAILED listing every failing field.
 */
function parseComment(body, { isCreate }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const details = [];
    const out = {};

    if (isCreate) {
        if (!isUuidV4(body.id)) details.push({ field: 'id', message: 'id must be a lowercase UUID v4' });
        else out.id = body.id;
    }

    out.text = parseText(details, body.text);

    if (isCreate) {
        out.status = check(details, 'status', () => parseEnum(body.status, STATUSES, 'Status'));
        if (out.status === undefined) out.status = null;
    }

    if (details.length) throw errors.validationFailed(details);
    return out;
}

module.exports = { parseComment, STATUSES, MAX_TEXT };
