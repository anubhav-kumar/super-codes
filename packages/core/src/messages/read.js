import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';

const WA_MESSAGE_ID_INDEX = 'byWaMessageId';

// waMessageId is omitted from items until set (it is a GSI key), but the contract exposes null.
export function toMessage(item) {
  return item ? { ...item, waMessageId: item.waMessageId ?? null } : null;
}

export async function getMessage(messageId) {
  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: getConfig().messagesTable,
      Key: { messageId },
      ConsistentRead: true,
    }),
  );
  return toMessage(Item);
}

export async function getMessageByWaId(waMessageId) {
  const { Items } = await getDocClient().send(
    new QueryCommand({
      TableName: getConfig().messagesTable,
      IndexName: WA_MESSAGE_ID_INDEX,
      KeyConditionExpression: 'waMessageId = :waMessageId',
      ExpressionAttributeValues: { ':waMessageId': waMessageId },
      Limit: 1,
    }),
  );
  return toMessage(Items?.[0]);
}

// Walks prevMessageId back from `before` (exclusive) or the chat head; newest first.
export async function readMessages({ chatId, before, limit = 30 }) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError('VALIDATION', 'limit must be a positive integer');
  }

  const headMessageId = await getHeadMessageId(chatId);
  let cursor = headMessageId;

  if (before) {
    const anchor = await getMessage(before);
    if (!anchor || anchor.chatId !== chatId) {
      throw new AppError('NOT_FOUND', 'Message not found');
    }
    cursor = anchor.prevMessageId;
  }

  const messages = [];
  const seen = new Set();
  while (cursor && messages.length < limit) {
    const message = await getMessage(cursor);
    // A missing, foreign or repeated item means a broken list; stop rather than loop or leak.
    if (!message || message.chatId !== chatId || seen.has(message.messageId)) break;
    seen.add(message.messageId);
    messages.push(message);
    cursor = message.prevMessageId;
  }

  const last = messages.at(-1);
  const nextBefore = last && cursor ? last.messageId : null;
  return { headMessageId, messages, nextBefore };
}

async function getHeadMessageId(chatId) {
  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: getConfig().chatsTable,
      Key: { chatId },
      ProjectionExpression: 'headMessageId',
      ConsistentRead: true,
    }),
  );
  return Item?.headMessageId ?? null;
}
