import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import {
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { getConfig } from '../config.js';
import { getDocClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, ROLES, UserSchema } from '../schemas/user.js';

const BCRYPT_COST = 10;
const EMAIL_GUARD_PREFIX = 'EMAIL#';
const BY_EMAIL_INDEX = 'byEmail';

// Compared against for unknown emails so a miss costs about as much as a wrong password.
let dummyHashPromise;
function getDummyHash() {
  dummyHashPromise ??= bcrypt.hash('vartalap-dummy-password', BCRYPT_COST);
  return dummyHashPromise;
}

function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

function isGuardItem(item) {
  return item.userId.startsWith(EMAIL_GUARD_PREFIX);
}

function assertPasswordLength(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError('VALIDATION', `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new AppError('VALIDATION', `Password must be at most ${PASSWORD_MAX_BYTES} bytes`);
  }
}

// The only way a stored user leaves this module: drops passwordHash and anything else internal.
function toPublicUser(item) {
  return UserSchema.parse({
    userId: item.userId,
    email: item.email,
    name: item.name,
    role: item.role,
    active: item.active,
    passwordChangedAt: item.passwordChangedAt ?? null,
  });
}

async function scanAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await getDocClient().send(new ScanCommand({ ...params, ExclusiveStartKey }));
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export async function createUser({ email, name, role, password }) {
  assertPasswordLength(password);
  if (!ROLES.includes(role)) {
    throw new AppError('VALIDATION', `Role must be one of: ${ROLES.join(', ')}`);
  }

  const normalizedEmail = normalizeEmail(email);
  const user = UserSchema.safeParse({
    userId: ulid(),
    email: normalizedEmail,
    name: String(name ?? '').trim(),
    role,
    active: true,
    passwordChangedAt: null,
  });
  if (!user.success) {
    throw new AppError('VALIDATION', 'Invalid user', user.error.issues);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const { usersTable } = getConfig();

  try {
    await getDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: usersTable,
              Item: { ...user.data, passwordHash },
              ConditionExpression: 'attribute_not_exists(userId)',
            },
          },
          {
            Put: {
              TableName: usersTable,
              Item: {
                userId: `${EMAIL_GUARD_PREFIX}${normalizedEmail}`,
                ownerUserId: user.data.userId,
              },
              ConditionExpression: 'attribute_not_exists(userId)',
            },
          },
        ],
      }),
    );
  } catch (err) {
    const conditionFailed =
      err.name === 'TransactionCanceledException' &&
      err.CancellationReasons?.some((reason) => reason?.Code === 'ConditionalCheckFailed');
    if (conditionFailed) throw new AppError('CONFLICT', 'Email already exists');
    throw err;
  }

  return user.data;
}

export async function getUserById(userId) {
  if (!userId) return null;
  const { Item } = await getDocClient().send(
    new GetCommand({ TableName: getConfig().usersTable, Key: { userId } }),
  );
  if (!Item || isGuardItem(Item)) return null;
  return toPublicUser(Item);
}

// Internal: for login only. Callers must not pass passwordHash beyond the auth check.
export async function getUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { Items } = await getDocClient().send(
    new QueryCommand({
      TableName: getConfig().usersTable,
      IndexName: BY_EMAIL_INDEX,
      KeyConditionExpression: '#email = :email',
      ExpressionAttributeNames: { '#email': 'email' },
      ExpressionAttributeValues: { ':email': normalizedEmail },
    }),
  );
  const item = Items?.find((candidate) => !isGuardItem(candidate));
  if (!item) return null;
  return { user: toPublicUser(item), passwordHash: item.passwordHash };
}

export async function verifyCredentials(email, password) {
  const found = await getUserByEmail(email);
  if (!found || typeof password !== 'string') {
    await bcrypt.compare(String(password ?? ''), await getDummyHash());
    return null;
  }

  const matches = await bcrypt.compare(password, found.passwordHash);
  if (!matches || !found.user.active) return null;
  return found.user;
}

export async function changePassword(userId, currentPassword, newPassword) {
  assertPasswordLength(newPassword);

  const { usersTable } = getConfig();
  const { Item } = userId
    ? await getDocClient().send(new GetCommand({ TableName: usersTable, Key: { userId } }))
    : {};
  if (!Item || isGuardItem(Item) || !Item.active) {
    throw new AppError('UNAUTHENTICATED', 'Current password is incorrect');
  }

  const matches =
    typeof currentPassword === 'string' &&
    (await bcrypt.compare(currentPassword, Item.passwordHash));
  if (!matches) throw new AppError('UNAUTHENTICATED', 'Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await getDocClient().send(
    new UpdateCommand({
      TableName: usersTable,
      Key: { userId },
      UpdateExpression: 'SET passwordHash = :hash, passwordChangedAt = :changedAt',
      ConditionExpression: 'attribute_exists(userId)',
      ExpressionAttributeValues: { ':hash': passwordHash, ':changedAt': new Date().toISOString() },
    }),
  );
}

export async function listUsers() {
  const items = await scanAll({
    TableName: getConfig().usersTable,
    FilterExpression: 'attribute_exists(#email)',
    ExpressionAttributeNames: { '#email': 'email' },
  });
  return items
    .filter((item) => !isGuardItem(item))
    .map(toPublicUser)
    .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
}

export async function listActiveAgents() {
  const items = await scanAll({
    TableName: getConfig().usersTable,
    FilterExpression: '#role = :agent AND #active = :true',
    ProjectionExpression: 'userId, #name, lastAutoAssignedAt',
    ExpressionAttributeNames: { '#role': 'role', '#active': 'active', '#name': 'name' },
    ExpressionAttributeValues: { ':agent': 'agent', ':true': true },
  });
  return items.map((item) => ({
    userId: item.userId,
    name: item.name,
    lastAutoAssignedAt: item.lastAutoAssignedAt ?? null,
  }));
}

// TransactWriteItems entry for M4's auto-assign. The condition makes two concurrent
// auto-assigns that read the same previousAt conflict instead of picking the same agent.
export function buildMarkAutoAssignedItem(userId, at, previousAt) {
  const isFirst = previousAt === null || previousAt === undefined;
  const ExpressionAttributeValues = { ':at': at, ':active': true };
  if (!isFirst) ExpressionAttributeValues[':previousAt'] = previousAt;

  return {
    Update: {
      TableName: getConfig().usersTable,
      Key: { userId },
      UpdateExpression: 'SET lastAutoAssignedAt = :at',
      // Also re-checks active, so an agent deactivated mid-selection is not picked.
      ConditionExpression: isFirst
        ? 'attribute_exists(userId) AND active = :active AND attribute_not_exists(lastAutoAssignedAt)'
        : 'active = :active AND lastAutoAssignedAt = :previousAt',
      ExpressionAttributeValues,
    },
  };
}
