'use strict';

const { QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const { getAssociation } = require('../../models/company');

/**
 * DELETE /directory/companies/{id}/associations/{personId}
 * 204 (empty)
 * 404 NOT_FOUND         association does not exist
 * 409 LAST_ASSOCIATION  the company has only this association
 * Admin only: a member gets 404 NOT_FOUND (F-55).
 * The person record is never deleted.
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const params = event.pathParameters || {};
    const companyId = params.id;
    const personId = params.personId;
    if (!validators.isUuidV4(companyId) || !validators.isUuidV4(personId)) throw errors.notFound();

    const existing = await getAssociation(companyId, personId);
    if (!existing) throw errors.notFound();

    const count = await database.doc.send(
        new QueryCommand({
            TableName: process.env.ASSOCIATIONS_TABLE,
            KeyConditionExpression: '#companyId = :id',
            ExpressionAttributeNames: { '#companyId': 'companyId' },
            ExpressionAttributeValues: { ':id': companyId },
            Select: 'COUNT',
            Limit: 2,
            ConsistentRead: true,
        })
    );
    if ((count.Count || 0) <= 1) {
        throw errors.conflict('LAST_ASSOCIATION', 'A company must have at least one associated person');
    }

    try {
        await database.doc.send(
            new DeleteCommand({
                TableName: process.env.ASSOCIATIONS_TABLE,
                Key: { companyId, personId },
                ConditionExpression: 'attribute_exists(personId)',
            })
        );
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') throw errors.notFound();
        throw err;
    }

    logger.info('association removed', { companyId, personId });
    return http.noContent();
}, { adminOnly: true });
