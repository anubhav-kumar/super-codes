import {
  AppError,
  ERROR_HTTP_STATUS,
  UNASSIGNED,
  getChat,
  getChatIdByPublicId,
  getUserById,
  isWindowOpen,
  toChatView,
  toMessageView,
} from '@vartalap/core';
import { SESSION_COOKIE, verifySession } from './session.js';

const GENERIC_INTERNAL_MESSAGE = 'Something went wrong';

function isAppError(err) {
  // Duck-typed as well, in case a second copy of @vartalap/core ends up in a bundle.
  return err instanceof AppError || (err?.name === 'AppError' && err.code in ERROR_HTTP_STATUS);
}

// Keeps only the last 4 digits of any long digit run (phone numbers in paths or messages).
export function maskDigits(value) {
  return String(value ?? '').replace(/\+?\d{5,}/g, (run) => `***${run.slice(-4)}`);
}

function logInternal(err, request) {
  console.error('Unhandled API error', {
    method: request?.method,
    path: maskDigits(request?.nextUrl?.pathname ?? ''),
    name: err?.name,
    message: maskDigits(err?.message),
  });
}

function errorResponse(err, request) {
  if (isAppError(err) && err.status < 500) {
    return Response.json(err.toBody(), { status: err.status });
  }
  // INTERNAL (thrown or unknown): log the error, never the request body, and hide the details.
  logInternal(err, request);
  return Response.json(
    { error: { code: 'INTERNAL', message: GENERIC_INTERNAL_MESSAGE } },
    { status: ERROR_HTTP_STATUS.INTERNAL },
  );
}

export function withHandler(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (err) {
      return errorResponse(err, request);
    }
  };
}

export function noContent(headers) {
  return new Response(null, { status: 204, headers });
}

// JWT iat has whole-second precision, so the cut-off is compared at second precision too;
// otherwise a session issued in the same second as the change (e.g. the re-issued cookie
// after PUT /api/me/password, or a fresh login) would be rejected.
function issuedBeforePasswordChange(session, user) {
  if (!user.passwordChangedAt) return false;
  const changedAt = Date.parse(user.passwordChangedAt);
  if (Number.isNaN(changedAt)) return false;
  return session.issuedAt < Math.floor(changedAt / 1000) * 1000;
}

// → public User (role and active come from the Users table, not the token).
export async function requireUser(request) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw new AppError('UNAUTHENTICATED', 'Not signed in');

  const user = await getUserById(session.userId);
  if (!user || !user.active || issuedBeforePasswordChange(session, user)) {
    throw new AppError('UNAUTHENTICATED', 'Session is no longer valid');
  }
  return user;
}

export async function requireAdmin(request) {
  const user = await requireUser(request);
  if (user.role !== 'admin') throw new AppError('FORBIDDEN', 'Admins only');
  return user;
}

function validationError(message, error) {
  return new AppError('VALIDATION', message, {
    issues: error.issues.map(({ path, message: issue }) => ({ path, message: issue })),
  });
}

export async function parseBody(request, schema) {
  let raw;
  try {
    raw = await request.json();
  } catch {
    throw new AppError('VALIDATION', 'Request body must be valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw validationError('Invalid request body', result.error);
  return result.data;
}

export function parseQuery(request, schema) {
  const result = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!result.success) throw validationError('Invalid query parameters', result.error);
  return result.data;
}

// F3: [id] route param (the chat's opaque publicId) → internal chatId (E.164), or null when
// the id is malformed or unknown. Never validates or echoes the param, so an old phone URL
// gets exactly the same answer as a missing chat once loadChatFor runs (D8): agents 403,
// admins 404.
export async function getChatId(context) {
  const { id } = await context.params;
  return getChatIdByPublicId(String(id ?? ''));
}

// Loads a chat the user may act on. Non-admins get FORBIDDEN for a missing chat too, so
// guessing ids in the URL doesn't reveal which chats exist. chatId may be null (unknown id).
export async function loadChatFor(user, chatId, assertAllowed) {
  const chat = chatId ? await getChat(chatId, { consistent: true }) : null;
  if (!chat) {
    if (user.role === 'admin') throw new AppError('NOT_FOUND', 'Chat not found');
    throw new AppError('FORBIDDEN', 'You cannot access this chat');
  }
  assertAllowed(user, chat);
  return chat;
}

// Chat → ChatSummary (adds assignee and windowOpen), for single-chat responses.
export async function toChatSummary(chat) {
  let assignee = null;
  if (chat.assignedTo !== UNASSIGNED) {
    const user = await getUserById(chat.assignedTo);
    assignee = { userId: chat.assignedTo, name: user?.name ?? chat.assignedTo };
  }
  // F4: last description editor as { userId, name } (null when never edited).
  let descriptionUpdatedBy = null;
  if (chat.descriptionUpdatedBy) {
    const editor =
      chat.descriptionUpdatedBy === chat.assignedTo && assignee
        ? assignee
        : await getUserById(chat.descriptionUpdatedBy);
    descriptionUpdatedBy = {
      userId: chat.descriptionUpdatedBy,
      name: editor?.name ?? chat.descriptionUpdatedBy,
    };
  }
  return { ...chat, assignee, windowOpen: isWindowOpen(chat), descriptionUpdatedBy };
}

// F3: route-side shorthand for `getChatId` + `loadChatFor`.
export async function resolveChat(context, user, assertAllowed) {
  return loadChatFor(user, await getChatId(context), assertAllowed);
}

// F3: single-chat response body (ChatView with assignee and windowOpen) for `user`'s role.
export async function chatResponse(chat, user) {
  return toChatView(await toChatSummary(chat), user);
}

// F3: every chat/message leaving the API goes through these views (no chatId, phone or wamid).
export { toChatView, toMessageView };
