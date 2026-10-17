import {
  AppError,
  ListMessagesQuerySchema,
  SendMessageBodySchema,
  appendMessage,
  assertCanSend,
  assertCanView,
  isWindowOpen,
  readMessages,
  updateStatus,
} from '@vartalap/core';
import {
  getChatId,
  loadChatFor,
  maskDigits,
  parseBody,
  parseQuery,
  requireUser,
  toChatSummary,
  withHandler,
} from '../../../../../lib/api.js';
import { sendOutbound } from '../../../../../lib/queue.js';

export const runtime = 'nodejs';

export const GET = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const chatId = await getChatId(context);
  const { before, limit } = parseQuery(request, ListMessagesQuerySchema);

  const chat = await loadChatFor(user, chatId, assertCanView);
  const { headMessageId, messages, nextBefore } = await readMessages({ chatId, before, limit });

  return Response.json({ chat: await toChatSummary(chat), headMessageId, messages, nextBefore });
});

export const POST = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const chatId = await getChatId(context);
  const { text } = await parseBody(request, SendMessageBodySchema);

  const chat = await loadChatFor(user, chatId, assertCanSend);
  if (!isWindowOpen(chat)) {
    throw new AppError(
      'WINDOW_EXPIRED',
      'The 24-hour reply window has closed; the client must message first',
    );
  }

  const { message } = await appendMessage({
    chatId,
    message: {
      direction: 'out',
      senderType: user.role,
      senderId: user.userId,
      type: 'text',
      text,
      status: 'pending',
    },
    chat: { isClientMessage: false },
  });

  try {
    await sendOutbound({ messageId: message.messageId, chatId });
  } catch (err) {
    console.error('Outbound enqueue failed', {
      messageId: message.messageId,
      chatId: maskDigits(chatId),
      name: err?.name,
    });
    try {
      await updateStatus({
        messageId: message.messageId,
        status: 'failed',
        errorCode: 'ENQUEUE_FAILED',
      });
    } catch (markErr) {
      console.error('Could not mark message failed', {
        messageId: message.messageId,
        name: markErr?.name,
      });
    }
    throw new AppError('INTERNAL', 'Message could not be queued for sending');
  }

  return Response.json({ message }, { status: 201 });
});
