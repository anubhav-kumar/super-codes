import { autoAssign } from '@vartalap/core';
import { getChatId, requireAdmin, withHandler } from '../../../../../lib/api.js';

export const runtime = 'nodejs';

export const POST = withHandler(async (request, context) => {
  const user = await requireAdmin(request);
  const chatId = await getChatId(context);
  const chat = await autoAssign({ chatId, by: user });
  return Response.json({ chat });
});
