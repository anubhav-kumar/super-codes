import { ListChatsQuerySchema, listChatsForUser } from '@vartalap/core';
import { parseQuery, requireUser, toChatView, withHandler } from '../../../lib/api.js';

export const runtime = 'nodejs';

// Core adds assignee (one listUsers call) and windowOpen, sorted by lastMessageAt desc.
// F3: internal items never leave the API; each is mapped to a ChatView for the caller's role.
export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  const { filter, tag } = parseQuery(request, ListChatsQuerySchema);
  // F4: ?tag= narrows the caller's own list only (it is a filter on the same Query/Scan).
  const chats = await listChatsForUser(user, filter, { tag });
  return Response.json({ chats: chats.map((chat) => toChatView(chat, user)) });
});
