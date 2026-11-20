'use strict';

const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http, logger } = require('common');
const { parseCreateCompanyBody } = require('../../validators/company');
const { buildItem } = require('../../models/person');
const {
    buildCompanyItem,
    toCompanyDetail,
    getCompany,
    loadCompanyDetail,
    assertCompanyPanFree,
    quickAddFields,
} = require('../../models/company');

/**
 * POST /directory/companies
 * 201 Company detail
 * 200 Company detail when a company with this id already exists (nothing written)
 * 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND, 409 PAN_TAKEN
 *
 * One TransactWriteItems: the company, each quick-added person that does not exist yet, and every
 * association. Quick-add ids that already exist are reused, not rewritten.
 */
module.exports.handler = middleware.withHandler(async ({ body }) => {
    const fields = parseCreateCompanyBody(body);
    const { id } = fields;

    const existing = await getCompany(id);
    if (existing) return http.ok(await loadCompanyDetail(existing));

    await assertCompanyPanFree(fields.pan, id);

    const people = await database.batchGetByIds(
        process.env.PEOPLE_TABLE,
        'id',
        fields.associations.map((a) => a.personId),
        ['name', 'phone', 'email']
    );

    const missing = [];
    fields.associations.forEach((a, i) => {
        if (!a.person && !people.has(a.personId)) {
            missing.push({ field: `associations[${i}].personId`, message: 'This person does not exist' });
        }
    });
    if (missing.length) throw errors.referenceNotFound(missing);

    const now = new Date().toISOString();
    const stamps = { createdAt: now, updatedAt: now };
    const company = buildCompanyItem(id, fields, stamps);

    const newPeople = fields.associations
        .filter((a) => a.person && !people.has(a.personId))
        .map((a) => buildItem(a.person.id, quickAddFields(a.person), stamps));
    for (const p of newPeople) people.set(p.id, p);

    const associations = fields.associations.map((a) => ({
        companyId: id,
        personId: a.personId,
        relationshipType: a.relationshipType,
        createdAt: now,
        updatedAt: now,
    }));

    const transactItems = [
        {
            Put: {
                TableName: process.env.COMPANIES_TABLE,
                Item: company,
                ConditionExpression: 'attribute_not_exists(id)',
            },
        },
        ...newPeople.map((item) => ({
            Put: { TableName: process.env.PEOPLE_TABLE, Item: item, ConditionExpression: 'attribute_not_exists(id)' },
        })),
        ...associations.map((item) => ({
            Put: {
                TableName: process.env.ASSOCIATIONS_TABLE,
                Item: item,
                ConditionExpression: 'attribute_not_exists(personId)',
            },
        })),
    ];

    try {
        await database.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (err) {
        const reasons = (err && err.name === 'TransactionCanceledException' && err.CancellationReasons) || [];
        if (reasons[0] && reasons[0].Code === 'ConditionalCheckFailed') {
            const raced = await getCompany(id);
            if (raced) return http.ok(await loadCompanyDetail(raced));
        }
        throw err;
    }

    logger.info('company created', {
        companyId: id,
        associations: associations.length,
        quickAddedPeople: newPeople.length,
    });
    return http.created(toCompanyDetail(company, associations, people));
});
