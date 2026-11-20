'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http } = require('common');
const { toPerson } = require('../../models/person');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function parseLimit(raw) {
    if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_LIMIT) {
        throw errors.validationFailed([{ field: 'limit', message: `limit must be a whole number from 1 to ${MAX_LIMIT}` }]);
    }
    return Number(raw);
}

/** nextToken must decode to a byName key: { id, entity: "PERSON", nameSort }. */
function parseNextToken(raw) {
    const key = database.decodeToken(raw);
    if (key === undefined) return undefined;
    const keys = Object.keys(key).sort().join(',');
    if (
        keys !== 'entity,id,nameSort' ||
        key.entity !== 'PERSON' ||
        typeof key.id !== 'string' ||
        typeof key.nameSort !== 'string'
    ) {
        throw errors.validationFailed([{ field: 'nextToken', message: 'nextToken is not valid' }]);
    }
    return key;
}

/**
 * GET /directory/people?limit=&nextToken=          paginated, sorted by name A-Z
 * GET /directory/people?individualClient=true      individual clients only, unpaginated
 * 200 { items: [Person object], nextToken: string | null }
 * 400 VALIDATION_FAILED  bad limit / nextToken, or individualClient other than "true"
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const query = event.queryStringParameters || {};

    if (query.individualClient !== undefined) {
        if (query.individualClient !== 'true') {
            throw errors.validationFailed([{ field: 'individualClient', message: 'individualClient must be "true"' }]);
        }
        const items = await database.queryAll({
            TableName: process.env.PEOPLE_TABLE,
            IndexName: 'byIndividual',
            KeyConditionExpression: '#k = :y',
            ExpressionAttributeNames: { '#k': 'individualKey' },
            ExpressionAttributeValues: { ':y': 'Y' },
        });
        return http.ok({ items: items.map(toPerson), nextToken: null });
    }

    const limit = parseLimit(query.limit);
    const startKey = parseNextToken(query.nextToken);

    const res = await database.doc.send(
        new QueryCommand({
            TableName: process.env.PEOPLE_TABLE,
            IndexName: 'byName',
            KeyConditionExpression: '#entity = :entity',
            ExpressionAttributeNames: { '#entity': 'entity' },
            ExpressionAttributeValues: { ':entity': 'PERSON' },
            Limit: limit,
            ExclusiveStartKey: startKey,
        })
    );

    return http.ok({
        items: (res.Items || []).map(toPerson),
        nextToken: database.encodeToken(res.LastEvaluatedKey),
    });
});
