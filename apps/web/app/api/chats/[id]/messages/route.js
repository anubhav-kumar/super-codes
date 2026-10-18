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
  chatResponse,
  getChatId,
  loadChatFor,
  maskDigits,
  parseBody,
  parseQuery,
  requireUser,
  toMessageView,
  withHandler,
} from '../../../../../lib/api.js';
import { prepareOutboundMedia } from '../../../../../lib/media.js'; // F2
import { sendOutbound } from '../../../../../lib/queue.js';

export const runtime = 'nodejs';

export const GET = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const chatId = await getChatId(context);
  const { before, limit } = parseQuery(request, ListMessagesQuerySchema);

  const chat = await loadChatFor(user, chatId, assertCanView);
  const { headMessageId, messages, nextBefore } = await readMessages({ chatId, before, limit });

  // F3: views only; no chatId, phone (agents) or wamid leaves the API.
  return Response.json({
    chat: await chatResponse(chat, user),
    headMessageId,
    messages: messages.map((m) => toMessageView(m, user)),
    nextBefore,
  });
});

export const POST = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const chatId = await getChatId(context);
  // F2: `{ text }` or `{ type, uploadId, caption?, filename? }`.
  const body = await parseBody(request, SendMessageBodySchema);

  const chat = await loadChatFor(user, chatId, assertCanSend);
  if (!isWindowOpen(chat)) {
    throw new AppError(
      'WINDOW_EXPIRED',
      'The 24-hour reply window has closed; the client must message first',
    );
  }

  // F2: a media send checks the upload (after the access and window checks) and uses the
  // uploadId as the message ID, so the file's key is out/<messageId>.
  const content =
    'uploadId' in body
      ? await prepareOutboundMedia(body, user)
      : { type: 'text', text: body.text };

  const { message, duplicate } = await appendMessage({
    chatId,
    message: {
      ...content,
      direction: 'out',
      senderType: user.role,
      senderId: user.userId,
      status: 'pending',
    },
    chat: { isClientMessage: false },
  });
  if (duplicate) throw new AppError('CONFLICT', 'This file has already been sent');

  try {
    await sendOutbound({ messageId: message.messageId, publicId: chat.publicId });
  } catch (err) {
    console.error('Outbound enqueue failed', {
      messageId: message.messageId,
      chatId: maskDigits(chatId),
      publicId: chat.publicId,
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

  return Response.json({ message: toMessageView(message, user) }, { status: 201 });
});
