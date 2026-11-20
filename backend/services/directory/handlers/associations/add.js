'use strict';

const { PutCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const { parseAddAssociationBody } = require('../../validators/company');
const { buildItem, getPerson } = require('../../models/person');
const { toAssociation, getCompany, quickAddFields } = require('../../models/company');

function associationExists() {
    return errors.conflict('ASSOCIATION_EXISTS', 'This person is already linked to this company');
}

async function putAssociation(item) {
    try {
        await database.doc.send(
            new PutCommand({
                TableName: process.env.ASSOCIATIONS_TABLE,
                Item: item,
                ConditionExpression: 'attribute_not_exists(personId)',
            })
        );
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') throw associationExists();
        throw err;
    }
}

/**
 * POST /directory/companies/{id}/associations
 * Body: { personId, relationshipType } or { person: { id, name, phone, email }, relationshipType }
 * 201 Association object
 * 400 VALIDATION_FAILED, 400 REFERENCE_NOT_FOUND, 404 NOT_FOUND, 409 ASSOCIATION_EXISTS
 */
module.exports.handler = middleware.withHandler(async ({ event, body }) => {
    const companyId = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(companyId)) throw errors.notFound();

    const input = parseAddAssociationBody(body);

    const company = await getCompany(companyId);
    if (!company) throw errors.notFound();

    const now = new Date().toISOString();
    let person = await getPerson(input.personId);
    let newPerson = null;
    if (!person) {
        if (!input.person) {
            throw errors.referenceNotFound([{ field: 'personId', message: 'This person does not exist' }]);
        }
        newPerson = buildItem(input.person.id, quickAddFields(input.person), { createdAt: now, updatedAt: now });
        person = newPerson;
    }

    const item = {
        companyId,
        personId: input.personId,
        relationshipType: input.relationshipType,
        createdAt: now,
        updatedAt: now,
    };

    if (!newPerson) {
        await putAssociation(item);
    } else {
        try {
            await database.doc.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Put: {
                                TableName: process.env.PEOPLE_TABLE,
                                Item: newPerson,
                                ConditionExpression: 'attribute_not_exists(id)',
                            },
                        },
                        {
                            Put: {
                                TableName: process.env.ASSOCIATIONS_TABLE,
                                Item: item,
                                ConditionExpression: 'attribute_not_exists(personId)',
                            },
                        },
                    ],
                })
            );
        } catch (err) {
            const reasons = (err && err.name === 'TransactionCanceledException' && err.CancellationReasons) || [];
            const failed = (i) => reasons[i] && reasons[i].Code === 'ConditionalCheckFailed';
            if (failed(1)) throw associationExists();
            if (!failed(0)) throw err;
            // The person was created concurrently: reuse it as is and link it.
            person = await getPerson(input.personId);
            newPerson = null;
            await putAssociation(item);
        }
    }

    logger.info('association added', { companyId, personId: input.personId, quickAdded: Boolean(newPerson) });
    return http.created(toAssociation(item, person));
});
