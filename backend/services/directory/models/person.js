'use strict';

const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { database, errors, validators } = require('common');

const PEOPLE_TABLE = () => process.env.PEOPLE_TABLE;

/** People table item -> Person object of the API. */
function toPerson(item) {
    return {
        id: item.id,
        name: item.name,
        isIndividualClient: item.isIndividualClient === true,
        pan: item.pan || null,
        email: item.email || null,
        phone: item.phone || null,
        address: item.address || null,
        notes: item.notes || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

/**
 * Builds the full People item from normalized fields. Optional fields that are null are left out
 * (removeUndefinedValues drops them), so the sparse GSI keys pan and individualKey are absent,
 * never null or "".
 */
function buildItem(id, fields, { createdAt, updatedAt }) {
    return {
        id,
        name: fields.name,
        isIndividualClient: fields.isIndividualClient,
        pan: fields.pan || undefined,
        email: fields.email || undefined,
        phone: fields.phone || undefined,
        address: fields.address || undefined,
        notes: fields.notes || undefined,
        entity: 'PERSON',
        nameSort: validators.nameSort(fields.name, id),
        individualKey: fields.isIndividualClient ? 'Y' : undefined,
        createdAt,
        updatedAt,
    };
}

async function getPerson(id) {
    const res = await database.doc.send(
        new GetCommand({ TableName: PEOPLE_TABLE(), Key: { id }, ConsistentRead: true })
    );
    return res.Item || null;
}

/** Throws 409 PAN_TAKEN when another person (not exceptId) already has this PAN. */
async function assertPanFree(pan, exceptId) {
    if (!pan) return;
    const items = await database.queryAll({
        TableName: PEOPLE_TABLE(),
        IndexName: 'byPan',
        KeyConditionExpression: '#pan = :pan',
        ExpressionAttributeNames: { '#pan': 'pan', '#id': 'id' },
        ExpressionAttributeValues: { ':pan': pan },
        ProjectionExpression: '#id',
    });
    if (items.some((item) => item.id !== exceptId)) {
        throw errors.conflict('PAN_TAKEN', 'A person with this PAN already exists', [
            { field: 'pan', message: 'A person with this PAN already exists' },
        ]);
    }
}

module.exports = { toPerson, buildItem, getPerson, assertPanFree };
