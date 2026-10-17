import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { FAILABLE_STATUSES, STATUS_RANK } from '../schemas/message.js';

// Records WhatsApp's acceptance; status moves to 'sent' only if that is forward.
export async function setWaMessageId(messageId, waMessageId) {
  if (!waMessageId) throw new AppError('VALIDATION', 'waMessageId is required');

  try {
    await update({
      Key: { messageId },
      UpdateExpression: 'SET waMessageId = :waMessageId, #status = :sent, statusRank = :rank',
      ConditionExpression: 'statusRank < :rank',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':waMessageId': waMessageId,
        ':sent': 'sent',
        ':rank': STATUS_RANK.sent,
      },
      ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
    });
    return { applied: true };
  } catch (err) {
    if (!isConditionFailure(err)) throw err;
    if (!err.Item) throw new AppError('NOT_FOUND', 'Message not found');
  }

  // Status is already at or past 'sent' (or failed): keep it, but still record the ID.
  await update({
    Key: { messageId },
    UpdateExpression: 'SET waMessageId = :waMessageId',
    ConditionExpression: 'attribute_exists(messageId)',
    ExpressionAttributeValues: { ':waMessageId': waMessageId },
  });
  return { applied: false };
}

// Forward-only. 'failed' is terminal: it drops statusRank so no later rank comparison passes.
export async function updateStatus({ messageId, status, errorCode }) {
  const params = status === 'failed' ? failedUpdate(errorCode) : forwardUpdate(status);
  try {
    await update({ Key: { messageId }, ...params });
    return { applied: true };
  } catch (err) {
    if (isConditionFailure(err)) return { applied: false };
    throw err;
  }
}

function forwardUpdate(status) {
  if (!(status in STATUS_RANK)) throw new AppError('VALIDATION', `Unknown status: ${status}`);
  return {
    UpdateExpression: 'SET #status = :status, statusRank = :rank',
    ConditionExpression: 'statusRank < :rank',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status, ':rank': STATUS_RANK[status] },
  };
}

function failedUpdate(errorCode) {
  const allowed = Object.fromEntries(FAILABLE_STATUSES.map((s, i) => [`:from${i}`, s]));
  return {
    UpdateExpression: 'SET #status = :status, errorCode = :errorCode REMOVE statusRank',
    ConditionExpression: `#status IN (${Object.keys(allowed).join(', ')})`,
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'failed',
      ':errorCode': errorCode == null ? null : String(errorCode),
      ...allowed,
    },
  };
}

function update(params) {
  return getDocClient().send(
    new UpdateCommand({ TableName: getConfig().messagesTable, ...params }),
  );
}

function isConditionFailure(err) {
  return err.name === 'ConditionalCheckFailedException';
}
