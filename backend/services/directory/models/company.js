'use strict';

const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { database, errors, validators } = require('common');
const { canOpenPerson } = require('../utils/scope');

const COMPANIES_TABLE = () => process.env.COMPANIES_TABLE;
const ASSOCIATIONS_TABLE = () => process.env.ASSOCIATIONS_TABLE;
const PEOPLE_TABLE = () => process.env.PEOPLE_TABLE;

/** Companies table item -> Company object of the API. */
function toCompany(item) {
    return {
        id: item.id,
        name: item.name,
        pan: item.pan,
        entityType: item.entityType,
        gstin: item.gstin || null,
        address: item.address || null,
        email: item.email || null,
        phone: item.phone || null,
        notes: item.notes || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

/** Full Companies item from normalized fields. Null optional fields are left out. */
function buildCompanyItem(id, fields, { createdAt, updatedAt }) {
    return {
        id,
        name: fields.name,
        pan: fields.pan,
        entityType: fields.entityType,
        gstin: fields.gstin || undefined,
        address: fields.address || undefined,
        email: fields.email || undefined,
        phone: fields.phone || undefined,
        notes: fields.notes || undefined,
        entity: 'COMPANY',
        nameSort: validators.nameSort(fields.name, id),
        createdAt,
        updatedAt,
    };
}

/**
 * CompanyAssociations item + People item (or undefined) -> Association object of the API.
 * canOpen false (member, person not a visible client): name only, personPhone and personEmail null.
 */
function toAssociation(item, person, canOpen = true) {
    return {
        companyId: item.companyId,
        personId: item.personId,
        personName: person ? person.name : null,
        personPhone: canOpen && person ? person.phone || null : null,
        personEmail: canOpen && person ? person.email || null : null,
        canOpen,
        relationshipType: item.relationshipType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

function byPersonName(a, b) {
    const an = a.personName === null ? null : a.personName.toLowerCase();
    const bn = b.personName === null ? null : b.personName.toLowerCase();
    if (an !== bn) {
        if (an === null) return 1;
        if (bn === null) return -1;
        return an < bn ? -1 : 1;
    }
    return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
}

/**
 * Company detail = Company object + associations sorted by person name. people: Map id -> item.
 * clientScope: null for an admin, else the member's scope from utils/scope (sets canOpen per person).
 */
function toCompanyDetail(company, associationItems, people, clientScope = null) {
    return {
        ...toCompany(company),
        associations: associationItems
            .map((a) => toAssociation(a, people.get(a.personId), canOpenPerson(clientScope, a.personId)))
            .sort(byPersonName),
    };
}

async function getCompany(id) {
    const res = await database.doc.send(
        new GetCommand({ TableName: COMPANIES_TABLE(), Key: { id }, ConsistentRead: true })
    );
    return res.Item || null;
}

async function getAssociation(companyId, personId) {
    const res = await database.doc.send(
        new GetCommand({ TableName: ASSOCIATIONS_TABLE(), Key: { companyId, personId }, ConsistentRead: true })
    );
    return res.Item || null;
}

/**
 * Reads the company's associations (consistent) and the linked people, returns Company detail.
 * clientScope: null for an admin, else the member's scope (see toCompanyDetail).
 */
async function loadCompanyDetail(company, clientScope = null) {
    const associations = await database.queryAll({
        TableName: ASSOCIATIONS_TABLE(),
        KeyConditionExpression: '#companyId = :id',
        ExpressionAttributeNames: { '#companyId': 'companyId' },
        ExpressionAttributeValues: { ':id': company.id },
        ConsistentRead: true,
    });
    const people = await database.batchGetByIds(
        PEOPLE_TABLE(),
        'id',
        associations.map((a) => a.personId),
        ['name', 'phone', 'email']
    );
    return toCompanyDetail(company, associations, people, clientScope);
}

/** Throws 409 PAN_TAKEN when another company (not exceptId) already has this PAN. */
async function assertCompanyPanFree(pan, exceptId) {
    const items = await database.queryAll({
        TableName: COMPANIES_TABLE(),
        IndexName: 'byPan',
        KeyConditionExpression: '#pan = :pan',
        ExpressionAttributeNames: { '#pan': 'pan', '#id': 'id' },
        ExpressionAttributeValues: { ':pan': pan },
        ProjectionExpression: '#id',
    });
    if (items.some((item) => item.id !== exceptId)) {
        throw errors.conflict('PAN_TAKEN', 'A company with this PAN already exists', [
            { field: 'pan', message: 'A company with this PAN already exists' },
        ]);
    }
}

/** People item for a quick-added person: not an individual client, no PAN. */
function quickAddFields(person) {
    return {
        name: person.name,
        isIndividualClient: false,
        pan: null,
        email: person.email,
        phone: person.phone,
        address: null,
        notes: null,
    };
}

module.exports = {
    toCompany,
    buildCompanyItem,
    toAssociation,
    toCompanyDetail,
    getCompany,
    getAssociation,
    loadCompanyDetail,
    assertCompanyPanFree,
    quickAddFields,
};
