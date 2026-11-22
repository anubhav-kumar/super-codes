'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http } = require('common');
const { toCompany } = require('../../models/company');
const { mapLimit } = require('../../utils/mapLimit');
const { outstandingByBilledTo, outstandingFields } = require('../../utils/outstanding');

const CONCURRENCY = 16;
const PRINCIPAL_TYPES = new Set(['DIRECTOR', 'PARTNER', 'PROPRIETOR']);

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function parseLimit(raw) {
    if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_LIMIT) {
        throw errors.validationFailed([{ field: 'limit', message: `limit must be a whole number from 1 to ${MAX_LIMIT}` }]);
    }
    return Number(raw);
}

/** nextToken must decode to a byName key: { id, entity: "COMPANY", nameSort }. */
function parseNextToken(raw) {
    const key = database.decodeToken(raw);
    if (key === undefined) return undefined;
    const keys = Object.keys(key).sort().join(',');
    if (
        keys !== 'entity,id,nameSort' ||
        key.entity !== 'COMPANY' ||
        typeof key.id !== 'string' ||
        typeof key.nameSort !== 'string'
    ) {
        throw errors.validationFailed([{ field: 'nextToken', message: 'nextToken is not valid' }]);
    }
    return key;
}

/**
 * Main contact order: DIRECTOR, PARTNER or PROPRIETOR first; then earliest linked
 * (association createdAt ascending); ties by personId.
 */
function byMainContact(a, b) {
    const ap = PRINCIPAL_TYPES.has(a.relationshipType) ? 0 : 1;
    const bp = PRINCIPAL_TYPES.has(b.relationshipType) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (a.createdAt !== b.createdAt) return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
    return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
}

/** Main contact of each company: Map companyId -> { personId, personName, personPhone, relationshipType } | null. */
async function mainContacts(companyIds) {
    const picked = await mapLimit(companyIds, CONCURRENCY, async (id) => {
        const associations = await database.queryAll({
            TableName: process.env.ASSOCIATIONS_TABLE,
            KeyConditionExpression: '#companyId = :id',
            ExpressionAttributeNames: { '#companyId': 'companyId' },
            ExpressionAttributeValues: { ':id': id },
        });
        return associations.length ? associations.sort(byMainContact)[0] : null;
    });
    const people = await database.batchGetByIds(
        process.env.PEOPLE_TABLE,
        'id',
        picked.filter(Boolean).map((a) => a.personId),
        ['name', 'phone']
    );
    const result = new Map();
    companyIds.forEach((id, i) => {
        const a = picked[i];
        if (!a) {
            result.set(id, null);
            return;
        }
        const person = people.get(a.personId);
        result.set(id, {
            personId: a.personId,
            personName: person ? person.name : null,
            personPhone: person ? person.phone || null : null,
            relationshipType: a.relationshipType,
        });
    });
    return result;
}

/** Companies items -> Company list items (Company object + mainContact, outstanding, hasOverdueInvoice). */
async function toListItems(items) {
    if (items.length === 0) return [];
    const ids = items.map((item) => item.id);
    const [contacts, owed] = await Promise.all([mainContacts(ids), outstandingByBilledTo(ids)]);
    return items.map((item) => ({
        ...toCompany(item),
        mainContact: contacts.get(item.id) || null,
        ...outstandingFields(owed, item.id),
    }));
}

/**
 * GET /directory/companies?limit=&nextToken=      paginated, sorted by name A-Z
 * 200 { items: [Company list item], nextToken: string | null }
 *     Company list item = Company object + mainContact { personId, personName, personPhone, relationshipType } | null,
 *     outstanding (INR, ISSUED invoices billed to this company), hasOverdueInvoice
 * 400 VALIDATION_FAILED  bad limit / nextToken
 */
module.exports.handler = middleware.withHandler(async ({ event }) => {
    const query = event.queryStringParameters || {};
    const limit = parseLimit(query.limit);
    const startKey = parseNextToken(query.nextToken);

    const res = await database.doc.send(
        new QueryCommand({
            TableName: process.env.COMPANIES_TABLE,
            IndexName: 'byName',
            KeyConditionExpression: '#entity = :entity',
            ExpressionAttributeNames: { '#entity': 'entity' },
            ExpressionAttributeValues: { ':entity': 'COMPANY' },
            Limit: limit,
            ExclusiveStartKey: startKey,
        })
    );

    return http.ok({
        items: await toListItems(res.Items || []),
        nextToken: database.encodeToken(res.LastEvaluatedKey),
    });
});
