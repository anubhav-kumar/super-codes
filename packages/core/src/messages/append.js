import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
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
    const prepared = { ...item, prevMessageId: current.headMessageId };

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

async function tryAppend(item, current, chat) {
  const { messagesTable, chatsTable } = getConfig();
  try {
    await getDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
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
    const [putReason, chatReason] = err.CancellationReasons ?? [];
    if (putReason?.Code === 'ConditionalCheckFailed') return 'duplicate';
    if (chatReason?.Code === 'ConditionalCheckFailed') return 'retry';
    if ([putReason?.Code, chatReason?.Code].includes('TransactionConflict')) return 'retry';
    throw err;
  }
}

function buildChatUpdate(item, current, chat) {
  const sets = [
    'headMessageId = :id',
    'lastMessageAt = :at',
    'lastMessagePreview = :preview',
    'assignedTo = if_not_exists(assignedTo, :unassigned)',
  ];
  const values = {
    ':id': item.messageId,
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
