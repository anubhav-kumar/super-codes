import {
  ListNotesQuerySchema,
  NoteBodySchema,
  assertCanView,
  createNote,
  listNotes,
} from '@vartalap/core';
import {
  parseBody,
  parseQuery,
  requireUser,
  resolveChat,
  withHandler,
} from '../../../../../lib/api.js';

export const runtime = 'nodejs';

// F4: internal notes about the client. Assignee agent or admin only; never sent to WhatsApp.
// GET ?before=<noteId>&limit=1..50 → { notes (newest first), nextBefore }
export const GET = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const { before, limit } = parseQuery(request, ListNotesQuerySchema);
  const chat = await resolveChat(context, user, assertCanView);

  const { notes, nextBefore } = await listNotes({ chatId: chat.chatId, before, limit });
  return Response.json({ notes, nextBefore });
});

// POST { body } → 201 { note }
export const POST = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const { body } = await parseBody(request, NoteBodySchema);
  const chat = await resolveChat(context, user, assertCanView);

  const note = await createNote({ chatId: chat.chatId, user, body });
  return Response.json({ note }, { status: 201 });
});
