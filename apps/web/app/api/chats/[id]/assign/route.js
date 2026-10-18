import { AppError, AssignBodySchema, assignChat } from '@vartalap/core';
import {
  chatResponse,
  getChatId,
  parseBody,
  requireAdmin,
  withHandler,
} from '../../../../../lib/api.js';

export const runtime = 'nodejs';

export const PUT = withHandler(async (request, context) => {
  const user = await requireAdmin(request);
  const chatId = await getChatId(context);
  const { userId } = await parseBody(request, AssignBodySchema);
  if (!chatId) throw new AppError('NOT_FOUND', 'Chat not found'); // F3: unknown publicId
  const chat = await assignChat({ chatId, userId, by: user });
  return Response.json({ chat: await chatResponse(chat, user) });
});
