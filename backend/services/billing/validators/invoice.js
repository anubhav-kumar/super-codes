'use strict';

const { validators, errors } = require('common');

const BASE_STATUSES = ['DRAFT', 'ISSUED', 'CANCELLED'];
const DISPLAYED_STATUS_FILTERS = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'UNPAID'];
const BILLED_TO_TYPES = ['PERSON', 'COMPANY'];
const CREATE_BASE_STATUSES = ['DRAFT', 'ISSUED'];
const DEFAULT_DUE_DAYS = 15;

const { check, normalizeString, parseDate, parseMoney, parseEnum, isUuidV4, todayIst } = validators;

function isBlank(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** Adds whole calendar days to a YYYY-MM-DD string using UTC date math. */
function addDays(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function parseReferenceId(details, field, value, { required, requiredMessage }) {
    if (isBlank(value)) {
        if (required) details.push({ field, message: requiredMessage });
        return required ? undefined : null;
    }
    if (!isUuidV4(value)) {
        details.push({ field, message: `${field} must be a lowercase UUID v4` });
        return undefined;
    }
    return value;
}

/**
 * Validates a create (isCreate) or update body and returns normalized fields:
 * { id?, billedToType, billedToId, orderId, invoiceDate, dueDate, description, amountPaise,
 *   taxPaise, totalPaise, baseStatus }.
 * Create: baseStatus DRAFT or ISSUED (default DRAFT); invoiceDate defaults to today IST;
 *   dueDate defaults to invoiceDate + 15 days.
 * Update: invoiceDate, dueDate and baseStatus are required.
 * Both: dueDate (when given) >= invoiceDate; amount required and > 0; tax defaults to 0.
 * Any "total" in the body is ignored; totalPaise = amountPaise + taxPaise.
 * Throws 400 VALIDATION_FAILED listing every failing field.
 */
function parseInvoice(body, { isCreate }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const details = [];
    const out = {};

    if (isCreate) {
        if (!isUuidV4(body.id)) details.push({ field: 'id', message: 'id must be a lowercase UUID v4' });
        else out.id = body.id;
    }

    out.billedToType = check(
        details,
        'billedToType',
        () => parseEnum(body.billedToType, BILLED_TO_TYPES, 'Billed to type'),
        { required: true, requiredMessage: 'Billed to type is required' }
    );
    out.billedToId = parseReferenceId(details, 'billedToId', body.billedToId, {
        required: true,
        requiredMessage: 'Billed to is required',
    });
    out.orderId = parseReferenceId(details, 'orderId', body.orderId, { required: false });

    out.invoiceDate = check(details, 'invoiceDate', () => parseDate(body.invoiceDate), {
        required: !isCreate,
        requiredMessage: 'Invoice date is required',
    });
    if (isCreate && out.invoiceDate === null) out.invoiceDate = todayIst();

    out.dueDate = check(details, 'dueDate', () => parseDate(body.dueDate), {
        required: !isCreate,
        requiredMessage: 'Due date is required',
    });
    if (isCreate && out.dueDate === null && typeof out.invoiceDate === 'string') {
        out.dueDate = addDays(out.invoiceDate, DEFAULT_DUE_DAYS);
    }
    if (typeof out.invoiceDate === 'string' && typeof out.dueDate === 'string' && out.dueDate < out.invoiceDate) {
        details.push({ field: 'dueDate', message: 'Due date cannot be before the invoice date' });
    }

    out.description = check(details, 'description', () =>
        normalizeString(body.description, { max: 2000, label: 'Description' })
    );

    out.amountPaise = check(details, 'amount', () => parseMoney(body.amount), {
        required: true,
        requiredMessage: 'Amount is required',
    });
    if (out.amountPaise === 0) {
        details.push({ field: 'amount', message: 'Amount must be greater than 0' });
    }

    out.taxPaise = check(details, 'tax', () => parseMoney(body.tax));
    if (out.taxPaise === null) out.taxPaise = 0;

    if (isCreate) {
        out.baseStatus = check(details, 'baseStatus', () =>
            parseEnum(body.baseStatus, CREATE_BASE_STATUSES, 'Status')
        );
        if (out.baseStatus === null) out.baseStatus = 'DRAFT';
    } else {
        out.baseStatus = check(details, 'baseStatus', () => parseEnum(body.baseStatus, BASE_STATUSES, 'Status'), {
            required: true,
            requiredMessage: 'Status is required',
        });
    }

    if (details.length) throw errors.validationFailed(details);
    out.totalPaise = out.amountPaise + out.taxPaise;
    return out;
}

module.exports = { parseInvoice, BASE_STATUSES, DISPLAYED_STATUS_FILTERS, BILLED_TO_TYPES };
