'use strict';

const { middleware, errors, validators, http } = require('common');
const { getCompany, loadCompanyDetail } = require('../../models/company');

/**
 * GET /directory/companies/{id}
 * 200 Company detail (Company object + associations sorted by person name)
 * 404 NOT_FOUND
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const company = await getCompany(id);
    if (!company) throw errors.notFound();

    return http.ok(await loadCompanyDetail(company));
});
