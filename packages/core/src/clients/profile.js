import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { MAX_TAGS_PER_CHAT } from '../schemas/client.js';
import { getUserById } from '../users/repo.js';
import { chatAccessCondition, recheckAccess } from './access.js';
import { assertTagAllowed } from './catalog.js';
import { isValidTag, tagsToArray, withClientAttributes } from './normalize-tag.js';

// F4: description and tags live on the Chats item (small and bounded). Every write is a
// separate UpdateItem that only touches these attributes, so it never clobbers what
// appendMessage / assign write, and vice versa.

async function editorRef(userId) {
  if (!userId) return null;
  const user = await getUserById(userId);
  return { userId, name: user?.name ?? userId };
}

// user: { userId, role }. description '' clears it. version: the profileVersion the client
// last saw (0 when the chat never had one). → updated chat item.
export async function updateDescription({ chatId, user, description, version }) {
  const text = String(description ?? '').trim();
  const access = chatAccessCondition(user);
  const now = new Date().toISOString();

  const set = [
    'descriptionUpdatedAt = :now',
    'descriptionUpdatedBy = :by',
    'profileVersion = :next',
  ];
  if (text) set.unshift('description = :d');
  const update = `SET ${set.join(', ')}${text ? '' : ' REMOVE description'}`;

  try {
    const { Attributes } = await getDocClient().send(
      new UpdateCommand({
        TableName: getConfig().chatsTable,
        Key: { chatId },
        UpdateExpression: update,
        ConditionExpression: `${access.expression} AND (profileVersion = :v OR (attribute_not_exists(profileVersion) AND :v = :zero))`,
        ExpressionAttributeValues: {
          ...access.values,
          ...(text ? { ':d': text } : {}),
          ':now': now,
          ':by': user.userId,
          ':next': version + 1,
          ':v': version,
          ':zero': 0,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return withClientAttributes(Attributes);
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
    // Access lost (reassigned, deleted) → FORBIDDEN / NOT_FOUND; otherwise a stale version.
    const current = await recheckAccess(user, chatId);
    throw new AppError('CONFLICT', 'The description was changed by someone else', {
      current: {
        description: current.description ?? '',
        profileVersion: Number(current.profileVersion ?? 0),
        descriptionUpdatedAt: current.descriptionUpdatedAt ?? null,
        descriptionUpdatedBy: await editorRef(current.descriptionUpdatedBy),
      },
    });
  }
}

// Idempotent: adding a tag the chat already has succeeds even at the limit. → sorted tags.
export async function addTag({ chatId, user, tag }) {
  if (!isValidTag(tag)) throw new AppError('VALIDATION', 'Invalid tag');
  await assertTagAllowed(tag);
  const access = chatAccessCondition(user);

  try {
    const { Attributes } = await getDocClient().send(
      new UpdateCommand({
        TableName: getConfig().chatsTable,
        Key: { chatId },
        UpdateExpression: 'ADD tags :tagSet',
        ConditionExpression: `${access.expression} AND (attribute_not_exists(tags) OR size(tags) < :max OR contains(tags, :tag))`,
        ExpressionAttributeValues: {
          ...access.values,
          ':tagSet': new Set([tag]),
          ':tag': tag,
          ':max': MAX_TAGS_PER_CHAT,
        },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return tagsToArray(Attributes?.tags);
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
    await recheckAccess(user, chatId);
    throw new AppError('CONFLICT', `A chat can have at most ${MAX_TAGS_PER_CHAT} tags`, {
      max: MAX_TAGS_PER_CHAT,
    });
  }
}

// Removing a tag the chat doesn't have is a no-op. → sorted tags.
export async function removeTag({ chatId, user, tag }) {
  if (!isValidTag(tag)) throw new AppError('VALIDATION', 'Invalid tag');
  const access = chatAccessCondition(user);

  try {
    const { Attributes } = await getDocClient().send(
      new UpdateCommand({
        TableName: getConfig().chatsTable,
        Key: { chatId },
        UpdateExpression: 'DELETE tags :tagSet',
        ConditionExpression: access.expression,
        ExpressionAttributeValues: { ...access.values, ':tagSet': new Set([tag]) },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return tagsToArray(Attributes?.tags);
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
    await recheckAccess(user, chatId);
    throw err; // access still holds, so the condition can't have failed; surface as INTERNAL
  }
}
