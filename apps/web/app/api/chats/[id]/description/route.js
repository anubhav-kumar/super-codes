import { UpdateDescriptionBodySchema, assertCanView, updateDescription } from '@vartalap/core';
import {
  chatResponse,
  parseBody,
  requireUser,
  resolveChat,
  withHandler,
} from '../../../../../lib/api.js';

export const runtime = 'nodejs';

// F4: PUT { description, version } → 200 { chat }. '' clears it. A stale version gets
// 409 CONFLICT with details.current. Assignee agent or admin only.
export const PUT = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const { description, version } = await parseBody(request, UpdateDescriptionBodySchema);
  const chat = await resolveChat(context, user, assertCanView);

  const updated = await updateDescription({ chatId: chat.chatId, user, description, version });
  return Response.json({ chat: await chatResponse(updated, user) });
});
