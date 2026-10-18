import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getClientNotesTable } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { MAX_CATALOG_TAGS } from '../schemas/client.js';
import { isValidTag } from './normalize-tag.js';

// F4 phase 3: admin tag catalog and the "catalog only" switch, stored in the ClientNotes
// table under a partition that can never be a chatId (chat keys are E.164 and start with '+'):
//   chatId = 'CATALOG', noteId = 'TAG#<name>'  → { name, createdAt, createdBy }
//   chatId = 'CATALOG', noteId = 'SETTINGS'    → { catalogOnly }
const CATALOG_PK = 'CATALOG';
const TAG_PREFIX = 'TAG#';
const SETTINGS_SK = 'SETTINGS';

function assertAdmin(by) {
  if (by?.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can manage tags');
}

async function getSettings() {
  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: getClientNotesTable(),
      Key: { chatId: CATALOG_PK, noteId: SETTINGS_SK },
    }),
  );
  return { catalogOnly: Boolean(Item?.catalogOnly) };
}

// Readable by every signed-in user: the catalog is admin-defined vocabulary, not client
// data, and agents need it for autocomplete when "catalog only" is on.
export async function listCatalog() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await getDocClient().send(
      new QueryCommand({
        TableName: getClientNotesTable(),
        KeyConditionExpression: 'chatId = :pk AND begins_with(noteId, :prefix)',
        ExpressionAttributeValues: { ':pk': CATALOG_PK, ':prefix': TAG_PREFIX },
        ExclusiveStartKey,
      }),
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const { catalogOnly } = await getSettings();
  return {
    catalogOnly,
    tags: items
      .map(({ name, createdAt, createdBy }) => ({ name, createdAt, createdBy }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function addCatalogTag({ name, by }) {
  assertAdmin(by);
  if (!isValidTag(name)) throw new AppError('VALIDATION', 'Invalid tag');
  const { tags } = await listCatalog();
  if (tags.length >= MAX_CATALOG_TAGS) {
    throw new AppError('CONFLICT', `The catalog can hold at most ${MAX_CATALOG_TAGS} tags`);
  }

  const item = {
    chatId: CATALOG_PK,
    noteId: `${TAG_PREFIX}${name}`,
    name,
    createdAt: new Date().toISOString(),
    createdBy: by.userId,
  };
  try {
    await getDocClient().send(
      new PutCommand({
        TableName: getClientNotesTable(),
        Item: item,
        ConditionExpression: 'attribute_not_exists(noteId)',
      }),
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new AppError('CONFLICT', 'That tag is already in the catalog');
    }
    throw err;
  }
  return { name, createdAt: item.createdAt, createdBy: item.createdBy };
}

// Removing a catalog tag does not remove it from chats that already carry it.
export async function removeCatalogTag({ name, by }) {
  assertAdmin(by);
  if (!isValidTag(name)) throw new AppError('VALIDATION', 'Invalid tag');
  try {
    await getDocClient().send(
      new DeleteCommand({
        TableName: getClientNotesTable(),
        Key: { chatId: CATALOG_PK, noteId: `${TAG_PREFIX}${name}` },
        ConditionExpression: 'attribute_exists(noteId)',
      }),
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new AppError('NOT_FOUND', 'Tag not in the catalog');
    }
    throw err;
  }
}

export async function setTagSettings({ catalogOnly, by }) {
  assertAdmin(by);
  await getDocClient().send(
    new PutCommand({
      TableName: getClientNotesTable(),
      Item: {
        chatId: CATALOG_PK,
        noteId: SETTINGS_SK,
        catalogOnly: Boolean(catalogOnly),
        updatedAt: new Date().toISOString(),
        updatedBy: by.userId,
      },
    }),
  );
  return { catalogOnly: Boolean(catalogOnly) };
}

// Called before a tag is added to a chat. Free-form unless "catalog only" is on.
export async function assertTagAllowed(tag) {
  // No ClientNotes table configured yet (stack not deployed): no catalog, so free-form.
  if (!process.env.CLIENT_NOTES_TABLE) return;
  const { catalogOnly } = await getSettings();
  if (!catalogOnly) return;
  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: getClientNotesTable(),
      Key: { chatId: CATALOG_PK, noteId: `${TAG_PREFIX}${tag}` },
    }),
  );
  if (!Item) {
    throw new AppError('VALIDATION', 'Only tags from the admin catalog can be added', {
      issues: [{ path: ['tag'], message: 'Only tags from the admin catalog can be added' }],
    });
  }
}
