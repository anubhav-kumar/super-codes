import { AddTagBodySchema, addTag, assertCanView } from '@vartalap/core';
import { parseBody, requireUser, resolveChat, withHandler } from '../../../../../lib/api.js';

export const runtime = 'nodejs';

// F4: POST { tag } → 200 { tags }. Idempotent (adding an existing tag is not an error), so
// 200 rather than 201. 409 CONFLICT at the 10-tag limit.
export const POST = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const { tag } = await parseBody(request, AddTagBodySchema);
  const chat = await resolveChat(context, user, assertCanView);

  const tags = await addTag({ chatId: chat.chatId, user, tag });
  return Response.json({ tags });
});
