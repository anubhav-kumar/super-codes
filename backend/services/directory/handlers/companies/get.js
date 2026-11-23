'use strict';

const { middleware, errors, validators, http } = require('common');
const { getCompany, loadCompanyDetail } = require('../../models/company');
const { loadClientScope, canOpenCompany } = require('../../utils/scope');

/**
 * GET /directory/companies/{id}
 * 200 Company detail (Company object + associations sorted by person name, each with canOpen;
 *     for a member, people who are not visible clients have canOpen false and null phone/email)
 * 404 NOT_FOUND  (also for a member when the company is not a visible client)
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const clientScope = await loadClientScope(user);
    if (!canOpenCompany(clientScope, id)) throw errors.notFound();

    const company = await getCompany(id);
    if (!company) throw errors.notFound();

    return http.ok(await loadCompanyDetail(company, clientScope));
});
