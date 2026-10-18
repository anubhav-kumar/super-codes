import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { UNASSIGNED } from '../schemas/chat.js';
import { listUsers } from '../users/repo.js';
import { isPublicId } from './public-id.js';
import { withClientAttributes } from '../clients/normalize-tag.js'; // F4
import { isWindowOpen } from './window.js';

export const CHAT_FILTERS = ['mine', 'unassigned', 'all'];
const BY_ASSIGNEE_INDEX = 'byAssignee';
const BY_PUBLIC_ID_INDEX = 'byPublicId'; // F3

export async function getChat(chatId, { consistent = false } = {}) {
  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: getConfig().chatsTable,
      Key: { chatId },
      ConsistentRead: consistent,
    }),
  );
  return Item ? withClientAttributes(Item) : null; // F4: tags Set → array
}

// F3: publicId → internal chatId via the sparse KEYS_ONLY GSI `byPublicId`, or null when the
// id is malformed or unknown. GSI reads are eventually consistent; callers re-read the chat
// with getChat(chatId, { consistent: true }) before using it.
export async function getChatIdByPublicId(publicId) {
  if (!isPublicId(publicId)) return null;
  const { Items } = await getDocClient().send(
    new QueryCommand({
      TableName: getConfig().chatsTable,
      IndexName: BY_PUBLIC_ID_INDEX,
      KeyConditionExpression: 'publicId = :p',
      ExpressionAttributeValues: { ':p': publicId },
      Limit: 1,
    }),
  );
  return Items?.[0]?.chatId ?? null;
}

// F3: publicId → chat item (consistent read), or null.
export async function getChatByPublicId(publicId) {
  const chatId = await getChatIdByPublicId(publicId);
  if (!chatId) return null;
  const chat = await getChat(chatId, { consistent: true });
  // Guard against a stale GSI entry (publicId is never changed, so this should not happen).
  return chat?.publicId === publicId ? chat : null;
}

// user: { userId, role }. Agents may only list their own chats.
// F4: options.tag (normalized) narrows any filter to chats carrying that tag. It is applied
// as a FilterExpression on the same Query/Scan, so an agent still only sees their own chats.
export async function listChatsForUser(user, filter, { tag } = {}) {
  if (!CHAT_FILTERS.includes(filter)) {
    throw new AppError('VALIDATION', `Unknown chat filter: ${filter}`);
  }
  if (user.role !== 'admin' && filter !== 'mine') {
    throw new AppError('FORBIDDEN', `Only admins can list ${filter} chats`);
  }

  const chats =
    filter === 'all'
      ? await scanAllChats(tag)
      : await queryByAssignee(filter === 'mine' ? user.userId : UNASSIGNED, tag);

  // Unassigned chats have no assignee to name, so skip the users lookup (unless F4 needs a
  // description editor's name).
  const needNames = filter !== 'unassigned' || chats.some((c) => c.descriptionUpdatedBy);
  const names = needNames ? await loadUserNames() : new Map();
  const now = Date.now();
  return chats.map((chat) => ({
    ...withClientAttributes(chat),
    // F4: last description editor as { userId, name } (null when never edited).
    descriptionUpdatedBy: chat.descriptionUpdatedBy
      ? {
          userId: chat.descriptionUpdatedBy,
          name: names.get(chat.descriptionUpdatedBy) ?? chat.descriptionUpdatedBy,
        }
      : null,
    assignee:
      chat.assignedTo === UNASSIGNED
        ? null
        : { userId: chat.assignedTo, name: names.get(chat.assignedTo) ?? chat.assignedTo },
    windowOpen: isWindowOpen(chat, now),
  }));
}

// F4: optional tag filter (same read cost; see f4 note §4.1).
function tagFilter(tag) {
  return tag
    ? { FilterExpression: 'contains(tags, :tag)', ExpressionAttributeValues: { ':tag': tag } }
    : { ExpressionAttributeValues: {} };
}

async function queryByAssignee(assignedTo, tag) {
  const filter = tagFilter(tag);
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await getDocClient().send(
      new QueryCommand({
        TableName: getConfig().chatsTable,
        IndexName: BY_ASSIGNEE_INDEX,
        KeyConditionExpression: 'assignedTo = :a',
        ...(filter.FilterExpression ? { FilterExpression: filter.FilterExpression } : {}),
        ExpressionAttributeValues: { ':a': assignedTo, ...filter.ExpressionAttributeValues },
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
async function scanAllChats(tag) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await getDocClient().send(
      new ScanCommand({
        TableName: getConfig().chatsTable,
        ExclusiveStartKey,
        ...(tag ? tagFilter(tag) : {}), // F4
      }),
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
