import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { UNASSIGNED } from '../schemas/chat.js';
import { listUsers } from '../users/repo.js';
import { isWindowOpen } from './window.js';

export const CHAT_FILTERS = ['mine', 'unassigned', 'all'];
const BY_ASSIGNEE_INDEX = 'byAssignee';

export async function getChat(chatId, { consistent = false } = {}) {
  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: getConfig().chatsTable,
      Key: { chatId },
      ConsistentRead: consistent,
    }),
  );
  return Item ?? null;
}

// user: { userId, role }. Agents may only list their own chats.
export async function listChatsForUser(user, filter) {
  if (!CHAT_FILTERS.includes(filter)) {
    throw new AppError('VALIDATION', `Unknown chat filter: ${filter}`);
  }
  if (user.role !== 'admin' && filter !== 'mine') {
    throw new AppError('FORBIDDEN', `Only admins can list ${filter} chats`);
  }

  const chats =
    filter === 'all'
      ? await scanAllChats()
      : await queryByAssignee(filter === 'mine' ? user.userId : UNASSIGNED);

  // Unassigned chats have no assignee to name, so skip the users lookup.
  const names = filter === 'unassigned' ? new Map() : await loadUserNames();
  const now = Date.now();
  return chats.map((chat) => ({
    ...chat,
    assignee:
      chat.assignedTo === UNASSIGNED
        ? null
        : { userId: chat.assignedTo, name: names.get(chat.assignedTo) ?? chat.assignedTo },
    windowOpen: isWindowOpen(chat, now),
  }));
}

async function queryByAssignee(assignedTo) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await getDocClient().send(
      new QueryCommand({
        TableName: getConfig().chatsTable,
        IndexName: BY_ASSIGNEE_INDEX,
        KeyConditionExpression: 'assignedTo = :a',
        ExpressionAttributeValues: { ':a': assignedTo },
        ScanIndexForward: false,
        ExclusiveStartKey,
      }),
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Acceptable at trial volume (see boilerplate 4.2).
async function scanAllChats() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await getDocClient().send(
      new ScanCommand({ TableName: getConfig().chatsTable, ExclusiveStartKey }),
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  // ISO timestamps sort lexically.
  return items.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

async function loadUserNames() {
  const users = await listUsers();
  return new Map(users.map((u) => [u.userId, u.name]));
}
