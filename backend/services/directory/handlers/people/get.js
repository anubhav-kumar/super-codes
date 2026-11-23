'use strict';

const { middleware, database, errors, validators, http } = require('common');
const { toPerson, getPerson } = require('../../models/person');
const { loadClientScope, canOpenPerson, canOpenCompany } = require('../../utils/scope');

function byCompanyName(a, b) {
    const an = a.companyName === null ? null : a.companyName.toLowerCase();
    const bn = b.companyName === null ? null : b.companyName.toLowerCase();
    if (an !== bn) {
        if (an === null) return 1;
        if (bn === null) return -1;
        return an < bn ? -1 : 1;
    }
    return a.companyId < b.companyId ? -1 : a.companyId > b.companyId ? 1 : 0;
}

/**
 * GET /directory/people/{id}
 * 200 Person object + "companies": [ { companyId, companyName, entityType, relationshipType, canOpen } ]
 *     sorted by company name. canOpen is always true for an admin; for a member it is true only for
 *     companies that are visible clients.
 * 404 NOT_FOUND  (also for a member when the person is not a visible client)
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const clientScope = await loadClientScope(user);
    if (!canOpenPerson(clientScope, id)) throw errors.notFound();

    const item = await getPerson(id);
    if (!item) throw errors.notFound();

    const associations = await database.queryAll({
        TableName: process.env.ASSOCIATIONS_TABLE,
        IndexName: 'byPerson',
        KeyConditionExpression: '#personId = :id',
        ExpressionAttributeNames: { '#personId': 'personId' },
        ExpressionAttributeValues: { ':id': id },
    });

    const companies = await database.batchGetByIds(
        process.env.COMPANIES_TABLE,
        'id',
        associations.map((a) => a.companyId),
        ['name', 'entityType']
    );

    const linked = associations
        .map((a) => {
            const company = companies.get(a.companyId);
            return {
                companyId: a.companyId,
                companyName: company ? company.name : null,
                entityType: company ? company.entityType || null : null,
                relationshipType: a.relationshipType,
                canOpen: canOpenCompany(clientScope, a.companyId),
            };
        })
        .sort(byCompanyName);

    return http.ok({ ...toPerson(item), companies: linked });
});
