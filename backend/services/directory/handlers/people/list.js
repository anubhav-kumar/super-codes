'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http } = require('common');
const { toPerson } = require('../../models/person');
const { mapLimit } = require('../../utils/mapLimit');
const { outstandingByBilledTo, outstandingFields } = require('../../utils/outstanding');
const { loadClientScope, canOpenCompany } = require('../../utils/scope');

const CONCURRENCY = 16;

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

/** First link first (association createdAt ascending), then company name (missing last), then id. */
function byLinkDate(a, b) {
    if (a.createdAt !== b.createdAt) return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
    const an = a.link.companyName === null ? null : a.link.companyName.toLowerCase();
    const bn = b.link.companyName === null ? null : b.link.companyName.toLowerCase();
    if (an !== bn) {
        if (an === null) return 1;
        if (bn === null) return -1;
        return an < bn ? -1 : 1;
    }
    return a.link.companyId < b.link.companyId ? -1 : a.link.companyId > b.link.companyId ? 1 : 0;
}

/** By nameSort, then id (member list order, same as the byName index). */
function byNameSort(a, b) {
    if (a.nameSort !== b.nameSort) return (a.nameSort || '') < (b.nameSort || '') ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Company links of each person: Map personId -> [ { companyId, companyName, entityType, relationshipType, canOpen } ].
 * clientScope: null for an admin (canOpen always true), else the member's scope.
 */
async function companiesByPerson(personIds, clientScope) {
    const perPerson = await mapLimit(personIds, CONCURRENCY, (id) =>
        database.queryAll({
            TableName: process.env.ASSOCIATIONS_TABLE,
            IndexName: 'byPerson',
            KeyConditionExpression: '#personId = :id',
            ExpressionAttributeNames: { '#personId': 'personId' },
            ExpressionAttributeValues: { ':id': id },
        })
    );
    const companies = await database.batchGetByIds(
        process.env.COMPANIES_TABLE,
        'id',
        perPerson.flat().map((a) => a.companyId),
        ['name', 'entityType']
    );
    const result = new Map();
    personIds.forEach((id, i) => {
        const links = perPerson[i]
            .map((a) => {
                const company = companies.get(a.companyId);
                return {
                    createdAt: a.createdAt,
                    link: {
                        companyId: a.companyId,
                        companyName: company ? company.name : null,
                        entityType: company ? company.entityType || null : null,
                        relationshipType: a.relationshipType,
                        canOpen: canOpenCompany(clientScope, a.companyId),
                    },
                };
            })
            .sort(byLinkDate)
            .map((x) => x.link);
        result.set(id, links);
    });
    return result;
}

/**
 * People items -> Person list items (Person object + companies, outstanding, hasOverdueInvoice).
 * For a member, outstanding counts only invoices of visible orders.
 */
async function toListItems(items, clientScope) {
    if (items.length === 0) return [];
    const ids = items.map((item) => item.id);
    const [links, owed] = await Promise.all([
        companiesByPerson(ids, clientScope),
        outstandingByBilledTo(ids, clientScope ? clientScope.orderIds : undefined),
    ]);
    return items.map((item) => ({
        ...toPerson(item),
        companies: links.get(item.id) || [],
        ...outstandingFields(owed, item.id),
    }));
}

/**
 * GET /directory/people?limit=&nextToken=          paginated, sorted by name A-Z
 * GET /directory/people?individualClient=true      individual clients only, unpaginated
 * 200 { items: [Person list item], nextToken: string | null }
 *     Person list item = Person object + companies [ { companyId, companyName, entityType, relationshipType, canOpen } ]
 *     (first link first), outstanding (INR, ISSUED invoices billed to this person), hasOverdueInvoice
 * 400 VALIDATION_FAILED  bad limit / nextToken (admin only), or individualClient other than "true"
 *
 * Member (F-55): only visible clients, sorted by name, unpaginated (limit and nextToken ignored,
 * nextToken null); outstanding counts only invoices of visible orders.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const query = event.queryStringParameters || {};

    if (query.individualClient !== undefined && query.individualClient !== 'true') {
        throw errors.validationFailed([{ field: 'individualClient', message: 'individualClient must be "true"' }]);
    }

    const clientScope = await loadClientScope(user);
    if (clientScope) {
        const people = await database.batchGetByIds(process.env.PEOPLE_TABLE, 'id', [...clientScope.personIds]);
        const items = [...people.values()]
            .filter((item) => query.individualClient === undefined || item.isIndividualClient === true)
            .sort(byNameSort);
        return http.ok({ items: await toListItems(items, clientScope), nextToken: null });
    }

    if (query.individualClient !== undefined) {
        const items = await database.queryAll({
            TableName: process.env.PEOPLE_TABLE,
            IndexName: 'byIndividual',
            KeyConditionExpression: '#k = :y',
            ExpressionAttributeNames: { '#k': 'individualKey' },
            ExpressionAttributeValues: { ':y': 'Y' },
        });
        return http.ok({ items: await toListItems(items, null), nextToken: null });
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
        items: await toListItems(res.Items || [], null),
        nextToken: database.encodeToken(res.LastEvaluatedKey),
    });
});
