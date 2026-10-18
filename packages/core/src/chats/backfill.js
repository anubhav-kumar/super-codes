import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { newPublicId } from './public-id.js';

// F3 backfill helpers (scripts/backfill-chat-public-ids.js). Not used by the web app or Lambdas.

// Yields the chatId of every chat that has no publicId yet.
export async function* chatIdsWithoutPublicId() {
  let ExclusiveStartKey;
  do {
    const page = await getDocClient().send(
      new ScanCommand({
        TableName: getConfig().chatsTable,
        ProjectionExpression: 'chatId',
        FilterExpression: 'attribute_not_exists(publicId)',
        ExclusiveStartKey,
      }),
    );
    for (const item of page.Items ?? []) yield item.chatId;
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

// Sets a new publicId only if the chat exists and still has none, so an id written
// concurrently by appendMessage (if_not_exists) is never replaced. → 'updated' | 'skipped'.
export async function assignPublicIdIfMissing(chatId) {
  try {
    await getDocClient().send(
      new UpdateCommand({
        TableName: getConfig().chatsTable,
        Key: { chatId },
        UpdateExpression: 'SET publicId = :pid',
        ConditionExpression: 'attribute_exists(chatId) AND attribute_not_exists(publicId)',
        ExpressionAttributeValues: { ':pid': newPublicId() },
      }),
    );
    return 'updated';
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return 'skipped';
    throw err;
  }
}
