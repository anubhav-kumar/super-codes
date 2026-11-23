'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { middleware, database, errors, validators, http, logger } = require('common');
const { parsePersonBody } = require('../../validators/person');
const { toPerson, buildItem, getPerson, assertPanFree } = require('../../models/person');
const { loadClientScope, canOpenPerson } = require('../../utils/scope');

/**
 * PUT /directory/people/{id}   full editable field set; omitted or null optional fields are cleared
 * 200 Person object
 * 400 VALIDATION_FAILED, 404 NOT_FOUND, 409 PAN_TAKEN
 * A member may update only a visible client; any other id is 404 before the body is validated.
 *
 * The item is replaced as a whole (keeping id and createdAt), so a cleared pan or a false
 * isIndividualClient removes the sparse GSI keys pan / individualKey.
 */
module.exports.handler = middleware.withHandler(async ({ event, body, user }) => {
    const id = event.pathParameters && event.pathParameters.id;
    if (!validators.isUuidV4(id)) throw errors.notFound();

    const clientScope = await loadClientScope(user);
    if (!canOpenPerson(clientScope, id)) throw errors.notFound();

    const fields = parsePersonBody(body, { withId: false });

    const existing = await getPerson(id);
    if (!existing) throw errors.notFound();

    await assertPanFree(fields.pan, id);

    const item = buildItem(id, fields, { createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
    try {
        await database.doc.send(
            new PutCommand({
                TableName: process.env.PEOPLE_TABLE,
                Item: item,
                ConditionExpression: 'attribute_exists(id)',
            })
        );
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') throw errors.notFound();
        throw err;
    }

    logger.info('person updated', { personId: id });
    return http.ok(toPerson(item));
});
