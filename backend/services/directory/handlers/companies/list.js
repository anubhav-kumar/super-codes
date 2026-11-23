'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, http } = require('common');
const { toCompany } = require('../../models/company');
const { mapLimit } = require('../../utils/mapLimit');
const { outstandingByBilledTo, outstandingFields } = require('../../utils/outstanding');
const { loadClientScope, canOpenPerson } = require('../../utils/scope');

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

/** By nameSort, then id (member list order, same as the byName index). */
function byNameSort(a, b) {
    if (a.nameSort !== b.nameSort) return (a.nameSort || '') < (b.nameSort || '') ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Main contact of each company: Map companyId -> { personId, personName, personPhone, relationshipType, canOpen } | null.
 * clientScope: null for an admin (canOpen always true). For a member, a contact who is not a visible
 * client has canOpen false and personPhone null.
 */
async function mainContacts(companyIds, clientScope) {
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
        const canOpen = canOpenPerson(clientScope, a.personId);
        result.set(id, {
            personId: a.personId,
            personName: person ? person.name : null,
            personPhone: canOpen && person ? person.phone || null : null,
            relationshipType: a.relationshipType,
            canOpen,
        });
    });
    return result;
}

/**
 * Companies items -> Company list items (Company object + mainContact, outstanding, hasOverdueInvoice).
 * For a member, outstanding counts only invoices of visible orders.
 */
async function toListItems(items, clientScope) {
    if (items.length === 0) return [];
    const ids = items.map((item) => item.id);
    const [contacts, owed] = await Promise.all([
        mainContacts(ids, clientScope),
        outstandingByBilledTo(ids, clientScope ? clientScope.orderIds : undefined),
    ]);
    return items.map((item) => ({
        ...toCompany(item),
        mainContact: contacts.get(item.id) || null,
        ...outstandingFields(owed, item.id),
    }));
}

/**
 * GET /directory/companies?limit=&nextToken=      paginated, sorted by name A-Z
 * 200 { items: [Company list item], nextToken: string | null }
 *     Company list item = Company object + mainContact { personId, personName, personPhone, relationshipType, canOpen } | null,
 *     outstanding (INR, ISSUED invoices billed to this company), hasOverdueInvoice
 * 400 VALIDATION_FAILED  bad limit / nextToken (admin only)
 *
 * Member (F-55): only visible clients, sorted by name, unpaginated (limit and nextToken ignored,
 * nextToken null); outstanding counts only invoices of visible orders.
 */
module.exports.handler = middleware.withHandler(async ({ event, user }) => {
    const query = event.queryStringParameters || {};

    const clientScope = await loadClientScope(user);
    if (clientScope) {
        const companies = await database.batchGetByIds(process.env.COMPANIES_TABLE, 'id', [...clientScope.companyIds]);
        const items = [...companies.values()].sort(byNameSort);
        return http.ok({ items: await toListItems(items, clientScope), nextToken: null });
    }
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
        items: await toListItems(res.Items || [], null),
        nextToken: database.encodeToken(res.LastEvaluatedKey),
    });
});
