// F2: updates to a message's media and reactions. These touch only the message item, never the
// chat head, so they don't move the chat in the list or change the linked list.
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { MEDIA_STATES } from '../media/constants.js';

const MEDIA_FIELDS = ['s3Key', 'mimeType', 'size', 'sha256', 'errorCode'];

// Sets media.state (and optional media.* fields). `from` limits the change to items whose state
// is one of those values (e.g. only pending → ready), so a late retry can't undo a final state.
// → { applied }.
export async function setMediaState(messageId, { state, from, ...fields }) {
  if (!MEDIA_STATES.includes(state)) throw new AppError('VALIDATION', `Unknown media state: ${state}`);

  const names = { '#media': 'media', '#state': 'state' };
  const values = { ':state': state };
  const sets = ['#media.#state = :state'];
  for (const key of MEDIA_FIELDS) {
    if (fields[key] === undefined) continue;
    names[`#${key}`] = key;
    values[`:${key}`] = fields[key];
    sets.push(`#media.#${key} = :${key}`);
  }

  let condition = 'attribute_exists(#media)';
  if (from?.length) {
    const keys = from.map((s, i) => {
      values[`:from${i}`] = s;
      return `:from${i}`;
    });
    condition += ` AND #media.#state IN (${keys.join(', ')})`;
  }

  try {
    await update({
      Key: { messageId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: condition,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    });
    return { applied: true };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return { applied: false };
    throw err;
  }
}

// Caches the Meta media ID of an outbound upload (valid 30 days), so a sender retry after the
// upload doesn't upload the file again.
export async function setOutboundWaMediaId(messageId, waMediaId) {
  await update({
    Key: { messageId },
    UpdateExpression: 'SET #media.#waMediaId = :id',
    ConditionExpression: 'attribute_exists(#media)',
    ExpressionAttributeNames: { '#media': 'media', '#waMediaId': 'waMediaId' },
    ExpressionAttributeValues: { ':id': waMediaId },
  });
}

// The client's reaction on one of our messages; emoji null/empty removes it (Meta sends a
// reaction without emoji for that). Decision D5: no chat head, window or list-order change.
export async function setClientReaction(messageId, emoji) {
  const params = emoji
    ? {
        UpdateExpression: 'SET #reactions = :r',
        ExpressionAttributeValues: { ':r': { client: String(emoji).slice(0, 32) } },
      }
    : { UpdateExpression: 'REMOVE #reactions' };
  await update({
    Key: { messageId },
    ConditionExpression: 'attribute_exists(messageId)',
    ExpressionAttributeNames: { '#reactions': 'reactions' },
    ...params,
  });
}

// Media fields that never leave the server: Meta's media ID, the S3 key and the checksum.
const MEDIA_HIDDEN_FIELDS = ['waMediaId', 's3Key', 'sha256'];

// Applied by toMessageView, so every message response is covered.
export function stripMediaInternals(message) {
  if (!message?.media) return message;
  const media = {};
  for (const [key, value] of Object.entries(message.media)) {
    if (!MEDIA_HIDDEN_FIELDS.includes(key)) media[key] = value;
  }
  return { ...message, media };
}

function update(params) {
  return getDocClient().send(
    new UpdateCommand({ TableName: getConfig().messagesTable, ...params }),
  );
}
