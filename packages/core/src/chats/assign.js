import { TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { buildMarkAutoAssignedItem, getUserById, listActiveAgents } from '../users/repo.js';
import { getChat } from './repo.js';
import { withClientAttributes } from '../clients/normalize-tag.js'; // F4

function assertAdmin(by) {
  if (by?.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can assign chats');
}

// Reassignment simply overwrites assignedTo; the previous assignee loses access at once.
export async function assignChat({ chatId, userId, by }) {
  assertAdmin(by);

  const target = await getUserById(userId);
  if (!target || !target.active) {
    throw new AppError('VALIDATION', 'Assignee must be an active user', { userId });
  }

  try {
    const { Attributes } = await getDocClient().send(
      new UpdateCommand({
        TableName: getConfig().chatsTable,
        Key: { chatId },
        UpdateExpression: 'SET assignedTo = :u',
        ConditionExpression: 'attribute_exists(chatId)',
        ExpressionAttributeValues: { ':u': userId },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return withClientAttributes(Attributes); // F4: tags Set → array
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new AppError('NOT_FOUND', 'Chat not found'); // F3: no chatId in details
    }
    throw err;
  }
}

// Never-assigned agents first, then oldest lastAutoAssignedAt, tie broken by userId.
function pickNextAgent(agents) {
  return [...agents].sort((a, b) => {
    const at = a.lastAutoAssignedAt ?? '';
    const bt = b.lastAutoAssignedAt ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  })[0];
}

// Round-robin. The agent's lastAutoAssignedAt is conditioned on its previous value, so two
// concurrent clicks cannot both pick the same "next" agent; the loser re-selects once.
export async function autoAssign({ chatId, by }) {
  assertAdmin(by);

  for (let attempt = 0; attempt < 2; attempt++) {
    const agents = await listActiveAgents();
    if (!agents.length) throw new AppError('CONFLICT', 'No active agents to assign to');

    const agent = pickNextAgent(agents);
    const now = new Date().toISOString();

    try {
      await getDocClient().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: getConfig().chatsTable,
                Key: { chatId },
                UpdateExpression: 'SET assignedTo = :u',
                ConditionExpression: 'attribute_exists(chatId)',
                ExpressionAttributeValues: { ':u': agent.userId },
              },
            },
            buildMarkAutoAssignedItem(agent.userId, now, agent.lastAutoAssignedAt),
          ],
        }),
      );
    } catch (err) {
      if (err.name !== 'TransactionCanceledException') throw err;
      const [chatReason, userReason] = err.CancellationReasons ?? [];
      if (chatReason?.Code === 'ConditionalCheckFailed') {
        throw new AppError('NOT_FOUND', 'Chat not found'); // F3: no chatId in details
      }
      if (userReason?.Code === 'ConditionalCheckFailed') continue; // lost the race; re-select
      throw err;
    }

    // Transactions cannot return item values, so read the chat back.
    return getChat(chatId, { consistent: true });
  }

  throw new AppError('CONFLICT', 'Auto-assign raced with another request; try again');
}
