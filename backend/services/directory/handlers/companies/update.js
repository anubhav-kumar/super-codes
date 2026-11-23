'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const { parseUpdateCompanyBody } = require('../../validators/company');
const { buildCompanyItem, getCompany, loadCompanyDetail, assertCompanyPanFree } = require('../../models/company');
const { loadClientScope, canOpenCompany } = require('../../utils/scope');

/**
 * PUT /directory/companies/{id}   full editable field set (no id, no associations)
 * 200 Company detail
 * 400 VALIDATION_FAILED, 404 NOT_FOUND, 409 PAN_TAKEN
 * Associations are changed only through the association routes.
 * A member may update only a visible client; any other id is 404 before the body is validated.
 * A member may not change pan: a body PAN that differs from the stored one is 400 VALIDATION_FAILED
 * (field pan), checked before the PAN uniqueness check.
 */
module.exports.handler = middleware.withHandler(async ({ event, body, user }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const clientScope = await loadClientScope(user);
    if (!canOpenCompany(clientScope, id)) throw errors.notFound();

    const fields = parseUpdateCompanyBody(body);

    const existing = await getCompany(id);
    if (!existing) throw errors.notFound();

    if (!user.isAdmin && (fields.pan || null) !== (existing.pan || null)) {
        throw errors.validationFailed([{ field: 'pan', message: 'Only an admin can change PAN' }]);
    }
    await assertCompanyPanFree(fields.pan, id);

    const item = buildCompanyItem(id, fields, { createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
    try {
        await database.doc.send(
            new PutCommand({
                TableName: process.env.COMPANIES_TABLE,
                Item: item,
                ConditionExpression: 'attribute_exists(id)',
            })
        );
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') throw errors.notFound();
        throw err;
    }

    logger.info('company updated', { companyId: id });
    return http.ok(await loadCompanyDetail(item, clientScope));
});
