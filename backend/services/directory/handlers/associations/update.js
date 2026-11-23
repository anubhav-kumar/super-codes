'use strict';

const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const { parseRelationshipBody } = require('../../validators/company');
const { getPerson } = require('../../models/person');
const { toAssociation } = require('../../models/company');

/**
 * PUT /directory/companies/{id}/associations/{personId}
 * Body: { relationshipType }
 * 200 Association object
 * 400 VALIDATION_FAILED, 404 NOT_FOUND (company or association does not exist)
 * Admin only: a member gets 404 NOT_FOUND (F-55).
 */
module.exports.handler = middleware.withHandler(async ({ event, body }) => {
    const params = event.pathParameters || {};
    const companyId = params.id;
    const personId = params.personId;
    if (!validators.isUuidV4(companyId) || !validators.isUuidV4(personId)) throw errors.notFound();

    const relationshipType = parseRelationshipBody(body);

    let item;
    try {
        const res = await database.doc.send(
            new UpdateCommand({
                TableName: process.env.ASSOCIATIONS_TABLE,
                Key: { companyId, personId },
                UpdateExpression: 'SET #rt = :rt, #updatedAt = :now',
                ConditionExpression: 'attribute_exists(personId)',
                ExpressionAttributeNames: { '#rt': 'relationshipType', '#updatedAt': 'updatedAt' },
                ExpressionAttributeValues: { ':rt': relationshipType, ':now': new Date().toISOString() },
                ReturnValues: 'ALL_NEW',
            })
        );
        item = res.Attributes;
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') throw errors.notFound();
        throw err;
    }

    const person = await getPerson(personId);
    logger.info('association updated', { companyId, personId });
    return http.ok(toAssociation(item, person));
}, { adminOnly: true });
