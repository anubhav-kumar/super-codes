import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { getClientNotesTable, getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { NOTE_EDIT_WINDOW_MS, NOTES_PAGE_DEFAULT } from '../schemas/client.js';
import { chatAccessCondition, recheckAccess } from './access.js';
import { loadUserNames, userRef } from './names.js';

// F4: internal notes about a client, one item each in ClientNotes (PK chatId, SK noteId ULID,
// so a descending Query is newest first). Every write is a transaction with a ConditionCheck
// on the Chats item, so a reassignment between the route's access check and the write still
// ends in FORBIDDEN. Deletes are soft: body is REMOVEd, the tombstone keeps who and when.
// Bodies never go into errors or logs.

const NOTE_ID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// The only shape in which a note leaves core: no chatId, names resolved.
export function toNoteView(item, names) {
  const view = {
    noteId: item.noteId,
    body: item.deletedAt ? null : (item.body ?? null),
    author: userRef(names, item.authorId),
    authorRole: item.authorRole,
    createdAt: item.createdAt,
    editedAt: item.editedAt ?? null,
    deleted: Boolean(item.deletedAt),
  };
  if (item.deletedAt) {
    view.deletedAt = item.deletedAt;
    view.deletedBy = userRef(names, item.deletedBy);
  }
  return view;
}

function chatCheck(chatId, user) {
  const access = chatAccessCondition(user);
  return {
    ConditionCheck: {
      TableName: getConfig().chatsTable,
      Key: { chatId },
      ConditionExpression: access.expression,
      ...(Object.keys(access.values).length
        ? { ExpressionAttributeValues: access.values }
        : {}),
    },
  };
}

// TransactionCanceled → the right AppError. reasons[0] is always the chat ConditionCheck.
async function handleCanceled(err, user, chatId, onNoteFailed) {
  if (err.name !== 'TransactionCanceledException') throw err;
  const [chatReason, noteReason] = err.CancellationReasons ?? [];
  if (chatReason?.Code === 'ConditionalCheckFailed') {
    await recheckAccess(user, chatId);
    throw new AppError('FORBIDDEN', 'You cannot access this chat');
  }
  if (noteReason?.Code === 'ConditionalCheckFailed') onNoteFailed();
  throw err;
}

async function getNote(chatId, noteId) {
  if (!NOTE_ID_REGEX.test(String(noteId ?? ''))) return null;
  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: getClientNotesTable(),
      Key: { chatId, noteId },
      ConsistentRead: true,
    }),
  );
  return Item ?? null;
}

// Newest first. before: a noteId (exclusive). → { notes, nextBefore }
export async function listNotes({ chatId, before, limit = NOTES_PAGE_DEFAULT }) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError('VALIDATION', 'limit must be a positive integer');
  }
  const values = { ':c': chatId };
  let condition = 'chatId = :c';
  if (before) {
    condition += ' AND noteId < :before';
    values[':before'] = before;
  }

  const { Items = [] } = await getDocClient().send(
    new QueryCommand({
      TableName: getClientNotesTable(),
      KeyConditionExpression: condition,
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
      Limit: limit + 1,
    }),
  );

  const page = Items.slice(0, limit);
  const names = await loadUserNames();
  return {
    notes: page.map((item) => toNoteView(item, names)),
    nextBefore: Items.length > limit ? page.at(-1).noteId : null,
  };
}

export async function createNote({ chatId, user, body }) {
  const text = String(body ?? '').trim();
  if (!text) throw new AppError('VALIDATION', 'Note cannot be empty');

  const item = {
    chatId,
    noteId: ulid(),
    body: text,
    authorId: user.userId,
    authorRole: user.role,
    createdAt: new Date().toISOString(),
  };

  try {
    await getDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
          chatCheck(chatId, user),
          {
            Put: {
              TableName: getClientNotesTable(),
              Item: item,
              ConditionExpression: 'attribute_not_exists(noteId)',
            },
          },
        ],
      }),
    );
  } catch (err) {
    await handleCanceled(err, user, chatId, () => {
      throw new AppError('CONFLICT', 'Note could not be saved; try again');
    });
  }
  return toNoteView(item, new Map([[user.userId, user.name]]));
}

// Author only, within NOTE_EDIT_WINDOW_MS of createdAt, and never once deleted.
export async function editNote({ chatId, noteId, user, body }) {
  const text = String(body ?? '').trim();
  if (!text) throw new AppError('VALIDATION', 'Note cannot be empty');

  const note = await getNote(chatId, noteId);
  if (!note || note.deletedAt) throw new AppError('NOT_FOUND', 'Note not found');
  if (note.authorId !== user.userId) {
    throw new AppError('FORBIDDEN', 'Only the author can edit a note');
  }
  const cutoff = new Date(Date.now() - NOTE_EDIT_WINDOW_MS).toISOString();
  if (note.createdAt <= cutoff) {
    throw new AppError('FORBIDDEN', 'Notes can only be edited for 15 minutes; add a new note');
  }

  const editedAt = new Date().toISOString();
  try {
    await getDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
          chatCheck(chatId, user),
          {
            Update: {
              TableName: getClientNotesTable(),
              Key: { chatId, noteId },
              UpdateExpression: 'SET body = :b, editedAt = :e',
              ConditionExpression:
                'attribute_exists(noteId) AND attribute_not_exists(deletedAt) AND authorId = :u AND createdAt > :cutoff',
              ExpressionAttributeValues: {
                ':b': text,
                ':e': editedAt,
                ':u': user.userId,
                ':cutoff': cutoff,
              },
            },
          },
        ],
      }),
    );
  } catch (err) {
    await handleCanceled(err, user, chatId, () => {
      throw new AppError('NOT_FOUND', 'Note not found');
    });
  }

  const names = new Map([[user.userId, user.name]]);
  return toNoteView({ ...note, body: text, editedAt }, names);
}

// Agents: own notes only. Admins: any note. Removes the body; keeps a tombstone.
export async function deleteNote({ chatId, noteId, user }) {
  const note = await getNote(chatId, noteId);
  if (!note || note.deletedAt) throw new AppError('NOT_FOUND', 'Note not found');
  const isAdmin = user.role === 'admin';
  if (!isAdmin && note.authorId !== user.userId) {
    throw new AppError('FORBIDDEN', 'You can only delete your own notes');
  }

  const values = { ':now': new Date().toISOString(), ':by': user.userId };
  let condition = 'attribute_exists(noteId) AND attribute_not_exists(deletedAt)';
  if (!isAdmin) {
    condition += ' AND authorId = :by';
  }

  try {
    await getDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
          chatCheck(chatId, user),
          {
            Update: {
              TableName: getClientNotesTable(),
              Key: { chatId, noteId },
              UpdateExpression: 'SET deletedAt = :now, deletedBy = :by REMOVE body',
              ConditionExpression: condition,
              ExpressionAttributeValues: values,
            },
          },
        ],
      }),
    );
  } catch (err) {
    await handleCanceled(err, user, chatId, () => {
      throw new AppError('NOT_FOUND', 'Note not found');
    });
  }
}
