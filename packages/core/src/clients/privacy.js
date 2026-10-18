import { BatchWriteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getChat } from '../chats/repo.js';
import { getClientNotesTable, getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { tagsToArray } from './normalize-tag.js';

// F4 phase 3: hooks for the PRD's deferred subject-access and erasure work (GDPR Art. 15/17,
// PDPA, PDPL). Not exposed through any route yet; the compliance feature that adds the
// request workflow (who may ask, verification, audit) calls these. Backups are out of reach
// here: PITR / on-demand backups keep erased data for their retention window.

const BATCH_SIZE = 25; // DynamoDB BatchWriteItem limit

async function queryAllNotes(chatId) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await getDocClient().send(
      new QueryCommand({
        TableName: getClientNotesTable(),
        KeyConditionExpression: 'chatId = :c',
        ExpressionAttributeValues: { ':c': chatId },
        ConsistentRead: true,
        ExclusiveStartKey,
      }),
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Everything F4 holds about one client: description, tags, notes (tombstones included, with
// no body). Internal shape for an export file; not an API response (it carries authorIds).
export async function exportClientAttributes(chatId) {
  const chat = await getChat(chatId, { consistent: true });
  const notes = await queryAllNotes(chatId);
  return {
    description: chat?.description ?? null,
    descriptionUpdatedAt: chat?.descriptionUpdatedAt ?? null,
    tags: tagsToArray(chat?.tags),
    notes: notes.map((n) => ({
      noteId: n.noteId,
      body: n.body ?? null,
      authorId: n.authorId,
      authorRole: n.authorRole,
      createdAt: n.createdAt,
      editedAt: n.editedAt ?? null,
      deletedAt: n.deletedAt ?? null,
      deletedBy: n.deletedBy ?? null,
    })),
  };
}

// Hard-deletes every note (and tombstone) for the chat and removes description and tags.
// profileVersion is bumped so an editor holding the old text gets CONFLICT, not a silent
// re-write. → { notesDeleted }
export async function eraseClientAttributes(chatId) {
  const notes = await queryAllNotes(chatId);
  for (let i = 0; i < notes.length; i += BATCH_SIZE) {
    let requests = notes.slice(i, i + BATCH_SIZE).map(({ noteId }) => ({
      DeleteRequest: { Key: { chatId, noteId } },
    }));
    // Retry unprocessed items with a short backoff (BatchWrite may throttle partially).
    for (let attempt = 0; requests.length; attempt++) {
      if (attempt > 5) throw new Error('Erasure did not finish; run it again');
      if (attempt) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      const { UnprocessedItems } = await getDocClient().send(
        new BatchWriteCommand({ RequestItems: { [getClientNotesTable()]: requests } }),
      );
      requests = UnprocessedItems?.[getClientNotesTable()] ?? [];
    }
  }

  try {
    await getDocClient().send(
      new UpdateCommand({
        TableName: getConfig().chatsTable,
        Key: { chatId },
        UpdateExpression:
          'REMOVE description, descriptionUpdatedAt, descriptionUpdatedBy, tags ADD profileVersion :one',
        ConditionExpression: 'attribute_exists(chatId)',
        ExpressionAttributeValues: { ':one': 1 },
      }),
    );
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err; // chat already gone
  }
  return { notesDeleted: notes.length };
}
