'use strict';

const { middleware, errors, validators, http } = require('common');
const scope = require('common/scope');
const { getOrder, loadOrderDetail } = require('../models/order');

/**
 * GET /orders/{id}
 * 200 Order detail, 404 NOT_FOUND (also for an id that is not a UUID v4)
 * Member: 404 NOT_FOUND unless their linked Worker is assigned to the order.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();
    if (scope.isMember(user) && !(await scope.isOrderVisible(user, id))) throw errors.notFound();

    const item = await getOrder(id);
    if (!item) throw errors.notFound();
    return http.ok(await loadOrderDetail(item));
});
