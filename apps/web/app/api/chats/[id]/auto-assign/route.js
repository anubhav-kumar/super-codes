import { AppError, autoAssign } from '@vartalap/core';
import { chatResponse, getChatId, requireAdmin, withHandler } from '../../../../../lib/api.js';

export const runtime = 'nodejs';

export const POST = withHandler(async (request, context) => {
  const user = await requireAdmin(request);
  const chatId = await getChatId(context);
  if (!chatId) throw new AppError('NOT_FOUND', 'Chat not found'); // F3: unknown publicId
  const chat = await autoAssign({ chatId, by: user });
  return Response.json({ chat: await chatResponse(chat, user) });
});
