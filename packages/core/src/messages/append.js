import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { newPublicId } from '../chats/public-id.js';
import { AppError } from '../errors.js';
import { CHAT_PREVIEW_LENGTH, UNASSIGNED } from '../schemas/chat.js';
import { MessageSchema, STATUS_RANK } from '../schemas/message.js';
import { toMessage } from './read.js';

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 20;

// Each append re-reads the head and retries if another writer moved it first.
export async function appendMessage({ chatId, message, chat = {} }) {
  const item = buildMessageItem(chatId, message);
  validate(item);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(Math.random() * BACKOFF_BASE_MS * 2 ** attempt);

    const current = await readChatHead(chatId);
    // Fresh timestamp per attempt keeps createdAt/lastMessageAt in list order after a retry.
    const prepared = {
      ...item,
      prevMessageId: current.headMessageId,
      createdAt: new Date().toISOString(),
    };

    const outcome = await tryAppend(prepared, current, chat);
    if (outcome === 'ok') return { message: toMessage(prepared), duplicate: false };
    if (outcome === 'duplicate') return { message: null, duplicate: true };
  }

  throw new AppError('INTERNAL', 'Could not append message: chat head kept changing', {
    messageId: item.messageId,
  });
}

function buildMessageItem(chatId, message) {
  const item = {
    messageId: message.messageId ?? ulid(),
    chatId,
    prevMessageId: null,
    direction: message.direction,
    senderType: message.senderType,
    senderId: message.senderId ?? null,
    type: message.type,
    text: message.text,
    status: message.status,
    createdAt: new Date().toISOString(),
  };
  // Omitted rather than null: waMessageId is the byWaMessageId GSI key and must be a string.
  if (message.waMessageId) item.waMessageId = message.waMessageId;
  // F2: media / location / contacts ride along when present. `text` stays the summary
  // ("[Photo] caption"), so lastMessagePreview needs no media-specific logic.
  for (const field of ['media', 'location', 'contacts']) {
    if (message[field] != null) item[field] = message[field];
  }
  if (message.direction === 'out' && message.status in STATUS_RANK) {
    item.statusRank = STATUS_RANK[message.status];
  }
  return item;
}

function validate(item) {
  const result = MessageSchema.safeParse(toMessage(item));
  if (!result.success) {
    throw new AppError('VALIDATION', 'Invalid message', {
      issues: result.error.issues.map(({ path, message }) => ({ path, message })),
    });
  }
}

async function readChatHead(chatId) {
  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: getConfig().chatsTable,
      Key: { chatId },
      ProjectionExpression: 'chatId, headMessageId',
      ConsistentRead: true,
    }),
  );
  return { exists: Boolean(Item), headMessageId: Item?.headMessageId ?? null };
}

// F3 Phase 2: a message carrying a WhatsApp id at append time (inbound) gets a guard item
// `WAMID#<wamid>` in the Messages table, put with attribute_not_exists in the same
// transaction. It replaces "messageId = wamid" for dedup, so messageIds are ULIDs and never
// embed the client's number. The guard has no waMessageId/chatId attributes, so it never
// appears in byWaMessageId and never matches a chat's message walk.
export const WAMID_GUARD_PREFIX = 'WAMID#';

function buildWamidGuard(item, messagesTable) {
  return {
    Put: {
      TableName: messagesTable,
      Item: {
        messageId: `${WAMID_GUARD_PREFIX}${item.waMessageId}`,
        kind: 'wamid-guard',
        targetMessageId: item.messageId,
        createdAt: item.createdAt,
      },
      ConditionExpression: 'attribute_not_exists(messageId)',
    },
  };
}

async function tryAppend(item, current, chat) {
  const { messagesTable, chatsTable } = getConfig();
  // Order: guard (when present), message, chat. Cancellation reasons follow the same order.
  const guard = item.waMessageId ? buildWamidGuard(item, messagesTable) : null;
  try {
    await getDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
          ...(guard ? [guard] : []),
          {
            Put: {
              TableName: messagesTable,
              Item: item,
              ConditionExpression: 'attribute_not_exists(messageId)',
            },
          },
          { Update: { TableName: chatsTable, ...buildChatUpdate(item, current, chat) } },
        ],
      }),
    );
    return 'ok';
  } catch (err) {
    if (err.name !== 'TransactionCanceledException') throw err;
    const reasons = err.CancellationReasons ?? [];
    const guardReason = guard ? reasons[0] : null;
    const [putReason, chatReason] = guard ? reasons.slice(1) : reasons;
    if (guardReason?.Code === 'ConditionalCheckFailed') return 'duplicate';
    if (putReason?.Code === 'ConditionalCheckFailed') return 'duplicate';
    if (chatReason?.Code === 'ConditionalCheckFailed') return 'retry';
    const codes = [guardReason?.Code, putReason?.Code, chatReason?.Code];
    if (codes.includes('TransactionConflict')) return 'retry';
    throw err;
  }
}

function buildChatUpdate(item, current, chat) {
  const sets = [
    'headMessageId = :id',
    'lastMessageAt = :at',
    'lastMessagePreview = :preview',
    'assignedTo = if_not_exists(assignedTo, :unassigned)',
    // F3: every chat gets an opaque publicId at creation; older chats heal on their next
    // message. if_not_exists keeps the first writer's id, so it never changes.
    'publicId = if_not_exists(publicId, :pid)',
  ];
  const values = {
    ':id': item.messageId,
    ':pid': newPublicId(),
    ':at': item.createdAt,
    ':preview': item.text.slice(0, CHAT_PREVIEW_LENGTH),
    ':unassigned': UNASSIGNED,
  };

  if (chat.isClientMessage) {
    sets.push('lastClientMessageAt = :at');
    if (chat.clientName != null) {
      sets.push('clientName = :clientName');
      values[':clientName'] = chat.clientName;
    }
  }

  let condition;
  if (!current.exists) {
    condition = 'attribute_not_exists(chatId)';
  } else if (current.headMessageId === null) {
    // Chat created elsewhere (e.g. by M4) before its first message.
    condition =
      'attribute_exists(chatId) AND (attribute_not_exists(headMessageId) OR attribute_type(headMessageId, :nullType))';
    values[':nullType'] = 'NULL';
  } else {
    condition = 'headMessageId = :head';
    values[':head'] = current.headMessageId;
  }

  return {
    Key: { chatId: item.chatId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ConditionExpression: condition,
    ExpressionAttributeValues: values,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
