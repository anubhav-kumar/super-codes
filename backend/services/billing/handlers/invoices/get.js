'use strict';

const { middleware, errors, validators, http } = require('common');
const { getInvoice, loadInvoiceDetail } = require('../../models/invoice');

/**
 * GET /billing/invoices/{id}
 * 200 Invoice detail (with payments), 404 NOT_FOUND (also for an id that is not a UUID v4)
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const item = await getInvoice(id);
    if (!item) throw errors.notFound();
    return http.ok(await loadInvoiceDetail(item));
});
