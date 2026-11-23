'use strict';

const { middleware, errors, validators, http } = require('common');
const scope = require('common/scope');
const { getInvoice, loadInvoiceDetail } = require('../../models/invoice');
const { isInvoiceVisible } = require('../../utils/memberInvoices');

/**
 * GET /billing/invoices/{id}
 * 200 Invoice detail (with payments), 404 NOT_FOUND (also for an id that is not a UUID v4)
 * Member: 404 NOT_FOUND unless the invoice has an orderId and that order is visible to them.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const item = await getInvoice(id);
    if (!item) throw errors.notFound();
    if (scope.isMember(user) && !(await isInvoiceVisible(user, item))) throw errors.notFound();
    return http.ok(await loadInvoiceDetail(item));
});
