'use strict';

const { validators, errors } = require('common');

const PAYMENT_STATUSES = ['CREATED', 'SENT', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'];

const { check, normalizeString, parseDate, parseMoney, parseEnum, isUuidV4 } = validators;

/**
 * Validates an add (isCreate) or update payment body and returns normalized fields:
 * { id?, amountPaise, link, expiryDate, status, paymentDate, transactionReference }.
 * Add: status optional, default CREATED. Update: status required.
 * Both: amount required and > 0; status PAID requires paymentDate.
 * Null optional fields mean "absent" (cleared on update).
 * Throws 400 VALIDATION_FAILED listing every failing field.
 */
function parsePayment(body, { isCreate }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw errors.validationFailed([{ field: 'body', message: 'Request body must be a JSON object' }]);
    }
    const details = [];
    const out = {};

    if (isCreate) {
        if (!isUuidV4(body.id)) details.push({ field: 'id', message: 'id must be a lowercase UUID v4' });
        else out.id = body.id;
    }

    out.amountPaise = check(details, 'amount', () => parseMoney(body.amount), {
        required: true,
        requiredMessage: 'Amount is required',
    });
    if (out.amountPaise === 0) {
        details.push({ field: 'amount', message: 'Amount must be greater than 0' });
    }

    out.link = check(details, 'link', () => normalizeString(body.link, { max: 500, label: 'Link' }));
    out.expiryDate = check(details, 'expiryDate', () => parseDate(body.expiryDate));

    out.status = check(details, 'status', () => parseEnum(body.status, PAYMENT_STATUSES, 'Status'), {
        required: !isCreate,
        requiredMessage: 'Status is required',
    });
    if (isCreate && out.status === null) out.status = 'CREATED';

    out.paymentDate = check(details, 'paymentDate', () => parseDate(body.paymentDate));
    if (out.status === 'PAID' && out.paymentDate === null) {
        details.push({ field: 'paymentDate', message: 'Payment date is required when status is Paid' });
    }

    out.transactionReference = check(details, 'transactionReference', () =>
        normalizeString(body.transactionReference, { max: 200, label: 'Transaction reference' })
    );

    if (details.length) throw errors.validationFailed(details);
    return out;
}

module.exports = { parsePayment, PAYMENT_STATUSES };
