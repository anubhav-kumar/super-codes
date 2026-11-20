'use strict';

const { errors, validators } = require('common');

const { check, normalizeString, parsePan, parseEmail, parsePhone, parseEnum, isUuidV4, FieldError } = validators;

const ENTITY_TYPES = ['PVT_LTD', 'LLP', 'PARTNERSHIP', 'PROPRIETORSHIP', 'OTHER'];
const RELATIONSHIP_TYPES = [
    'DIRECTOR',
    'PARTNER',
    'PROPRIETOR',
    'EMPLOYEE',
    'AUTHORIZED_SIGNATORY',
    'ACCOUNTS_CONTACT',
    'OTHER',
];
const MAX_ASSOCIATIONS = 20;
const GSTIN = /^[0-9A-Z]{15}$/;

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObjectBody(body) {
    if (!isObject(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
}

function parseGstin(value) {
    const s = normalizeString(value, { label: 'GSTIN' });
    if (s === null) return null;
    const upper = s.toUpperCase();
    if (!GSTIN.test(upper)) throw new FieldError('GSTIN must be 15 letters or digits');
    return upper;
}

function parseRelationshipType(details, field, value) {
    return check(details, field, () => parseEnum(value, RELATIONSHIP_TYPES, 'Relationship type'), {
        required: true,
        requiredMessage: 'Relationship type is required',
    });
}

/**
 * Validates one association input (either form) and pushes failures into details, with field
 * names prefixed by `prefix` (e.g. "associations[1]."). Returns
 * { personId, person: { id, name, phone, email } | null, relationshipType }, or null when invalid.
 */
function parseAssociationInput(input, prefix, details) {
    const at = (name) => `${prefix}${name}`;
    const whole = prefix ? prefix.replace(/\.$/, '') : 'body';
    if (!isObject(input)) {
        details.push({ field: whole, message: 'Each associated person must be an object' });
        return null;
    }
    const before = details.length;
    const hasId = input.personId !== undefined && input.personId !== null;
    const hasPerson = input.person !== undefined && input.person !== null;
    const out = { personId: undefined, person: null, relationshipType: undefined };

    if (hasId === hasPerson) {
        details.push({ field: whole, message: 'Give either personId or person' });
    } else if (hasId) {
        if (!isUuidV4(input.personId)) details.push({ field: at('personId'), message: 'personId must be a lowercase UUID v4' });
        else out.personId = input.personId;
    } else if (!isObject(input.person)) {
        details.push({ field: at('person'), message: 'person must be an object' });
    } else {
        const p = input.person;
        const person = {};
        if (!isUuidV4(p.id)) details.push({ field: at('person.id'), message: 'id must be a lowercase UUID v4' });
        else person.id = p.id;
        person.name = check(details, at('person.name'), () => normalizeString(p.name, { min: 1, max: 100, label: 'Name' }), {
            required: true,
            requiredMessage: 'Name is required',
        });
        person.phone = check(details, at('person.phone'), () => parsePhone(p.phone));
        person.email = check(details, at('person.email'), () => parseEmail(p.email));
        out.person = person;
        out.personId = person.id;
    }

    out.relationshipType = parseRelationshipType(details, at('relationshipType'), input.relationshipType);
    return details.length === before ? out : null;
}

/** Company fields shared by create and update. Pushes failures into details. */
function parseCompanyFields(body, details) {
    const out = {};
    out.name = check(details, 'name', () => normalizeString(body.name, { min: 1, max: 100, label: 'Name' }), {
        required: true,
        requiredMessage: 'Name is required',
    });
    out.pan = check(details, 'pan', () => parsePan(body.pan), { required: true, requiredMessage: 'PAN is required' });
    out.entityType = check(details, 'entityType', () => parseEnum(body.entityType, ENTITY_TYPES, 'Entity type'), {
        required: true,
        requiredMessage: 'Entity type is required',
    });
    out.gstin = check(details, 'gstin', () => parseGstin(body.gstin));
    out.address = check(details, 'address', () => normalizeString(body.address, { max: 500, label: 'Address' }));
    out.email = check(details, 'email', () => parseEmail(body.email));
    out.phone = check(details, 'phone', () => parsePhone(body.phone));
    out.notes = check(details, 'notes', () => normalizeString(body.notes, { max: 2000, label: 'Notes' }));
    return out;
}

/** POST /directory/companies body. Every failure is collected, then 400 VALIDATION_FAILED. */
function parseCreateCompanyBody(body) {
    assertObjectBody(body);
    const details = [];
    const out = {};
    if (!isUuidV4(body.id)) details.push({ field: 'id', message: 'id must be a lowercase UUID v4' });
    else out.id = body.id;

    Object.assign(out, parseCompanyFields(body, details));

    out.associations = [];
    const list = body.associations;
    if (list !== undefined && list !== null && !Array.isArray(list)) {
        details.push({ field: 'associations', message: 'associations must be a list' });
    } else if (!list || list.length === 0) {
        details.push({ field: 'associations', message: 'Add at least one associated person' });
    } else if (list.length > MAX_ASSOCIATIONS) {
        details.push({ field: 'associations', message: `At most ${MAX_ASSOCIATIONS} associated people` });
    } else {
        const seen = new Set();
        list.forEach((input, i) => {
            const parsed = parseAssociationInput(input, `associations[${i}].`, details);
            if (!parsed) return;
            if (seen.has(parsed.personId)) {
                details.push({ field: `associations[${i}]`, message: 'This person is already linked' });
                return;
            }
            seen.add(parsed.personId);
            out.associations.push(parsed);
        });
    }

    if (details.length) throw errors.validationFailed(details);
    return out;
}

/** PUT /directory/companies/{id} body (no id, no associations; an associations key is ignored). */
function parseUpdateCompanyBody(body) {
    assertObjectBody(body);
    const details = [];
    const out = parseCompanyFields(body, details);
    if (details.length) throw errors.validationFailed(details);
    return out;
}

/** POST /directory/companies/{id}/associations body. */
function parseAddAssociationBody(body) {
    assertObjectBody(body);
    const details = [];
    const parsed = parseAssociationInput(body, '', details);
    if (details.length) throw errors.validationFailed(details);
    return parsed;
}

/** PUT /directory/companies/{id}/associations/{personId} body. */
function parseRelationshipBody(body) {
    assertObjectBody(body);
    const details = [];
    const relationshipType = parseRelationshipType(details, 'relationshipType', body.relationshipType);
    if (details.length) throw errors.validationFailed(details);
    return relationshipType;
}

module.exports = {
    ENTITY_TYPES,
    RELATIONSHIP_TYPES,
    parseCreateCompanyBody,
    parseUpdateCompanyBody,
    parseAddAssociationBody,
    parseRelationshipBody,
};
