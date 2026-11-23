'use strict';

const { middleware, errors, validators, http } = require('common');
const scope = require('common/scope');
const { getInvoice, loadInvoiceDetail } = require('../../models/invoice');
const { isInvoiceVisible, memberClients } = require('../../utils/memberInvoices');

/**
 * GET /billing/invoices/{id}
 * 200 Invoice detail (with payments), 404 NOT_FOUND (also for an id that is not a UUID v4)
 * Member: 404 NOT_FOUND unless the invoice has an orderId and that order is visible to them.
 * billedTo.canOpen: admin true; member true only when the billed-to party is a visible client.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const item = await getInvoice(id);
    if (!item) throw errors.notFound();
    if (!scope.isMember(user)) return http.ok(await loadInvoiceDetail(item));
    if (!(await isInvoiceVisible(user, item))) throw errors.notFound();
    // The invoice's order passed the base-table check, so it counts even before byWorker catches up.
    const visible = await scope.visibleOrderIds(user);
    visible.add(item.orderId);
    return http.ok(await loadInvoiceDetail(item, { clients: await memberClients(user, visible) }));
});
