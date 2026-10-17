import { AssignBodySchema, assignChat } from '@vartalap/core';
import { getChatId, parseBody, requireAdmin, withHandler } from '../../../../../lib/api.js';

export const runtime = 'nodejs';

export const PUT = withHandler(async (request, context) => {
  const user = await requireAdmin(request);
  const chatId = await getChatId(context);
  const { userId } = await parseBody(request, AssignBodySchema);
  const chat = await assignChat({ chatId, userId, by: user });
  return Response.json({ chat });
});
