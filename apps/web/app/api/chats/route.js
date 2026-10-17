import { ListChatsQuerySchema, listChatsForUser } from '@vartalap/core';
import { parseQuery, requireUser, withHandler } from '../../../lib/api.js';

export const runtime = 'nodejs';

// Core adds assignee (one listUsers call) and windowOpen, sorted by lastMessageAt desc.
export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  const { filter } = parseQuery(request, ListChatsQuerySchema);
  const chats = await listChatsForUser(user, filter);
  return Response.json({ chats });
});
