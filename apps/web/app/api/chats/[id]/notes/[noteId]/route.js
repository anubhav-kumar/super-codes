import { NoteBodySchema, assertCanView, deleteNote, editNote } from '@vartalap/core';
import {
  noContent,
  parseBody,
  requireUser,
  resolveChat,
  withHandler,
} from '../../../../../../lib/api.js';

export const runtime = 'nodejs';

// F4: PATCH { body } → 200 { note }. Author only, within 15 minutes of creation.
export const PATCH = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const { body } = await parseBody(request, NoteBodySchema);
  const chat = await resolveChat(context, user, assertCanView);
  const { noteId } = await context.params;

  const note = await editNote({ chatId: chat.chatId, noteId: String(noteId), user, body });
  return Response.json({ note });
});

// DELETE → 204. Soft delete: the body is removed, a tombstone stays. Agents: own notes only.
export const DELETE = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const chat = await resolveChat(context, user, assertCanView);
  const { noteId } = await context.params;

  await deleteNote({ chatId: chat.chatId, noteId: String(noteId), user });
  return noContent();
});
