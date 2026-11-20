'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, http, logger } = require('common');
const { parsePersonBody } = require('../../validators/person');
const { toPerson, buildItem, getPerson, assertPanFree } = require('../../models/person');

/**
 * POST /directory/people
 * 201 Person object
 * 200 Person object when a person with this id already exists (nothing written)
 * 400 VALIDATION_FAILED, 409 PAN_TAKEN
 */
module.exports.handler = middleware.withHandler(async ({ body }) => {
    const fields = parsePersonBody(body, { withId: true });
    const { id } = fields;

    const existing = await getPerson(id);
    if (existing) return http.ok(toPerson(existing));

    await assertPanFree(fields.pan, id);

    const now = new Date().toISOString();
    const item = buildItem(id, fields, { createdAt: now, updatedAt: now });
    try {
        await database.doc.send(
            new PutCommand({
                TableName: process.env.PEOPLE_TABLE,
                Item: item,
                ConditionExpression: 'attribute_not_exists(id)',
            })
        );
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') {
            const raced = await getPerson(id);
            if (raced) return http.ok(toPerson(raced));
        }
        throw err;
    }

    logger.info('person created', { personId: id });
    return http.created(toPerson(item));
});
