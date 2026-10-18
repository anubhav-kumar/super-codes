// F2: POST /api/chats/[id]/uploads → a presigned S3 POST form for one outbound file.
// The browser uploads straight to S3 (bytes never pass through this API), then sends the
// message with POST /api/chats/[id]/messages { type, uploadId, caption?, filename? }.
import { ulid } from 'ulid';
import { AppError, CreateUploadBodySchema, assertCanSend, isWindowOpen } from '@vartalap/core';
import { getChatId, loadChatFor, parseBody, requireUser, withHandler } from '../../../../../lib/api.js';
import { UPLOAD_EXPIRES_SEC, checkUploadRequest, createUploadForm } from '../../../../../lib/media.js';

export const runtime = 'nodejs';

export const POST = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const chatId = await getChatId(context);
  const body = await parseBody(request, CreateUploadBodySchema);

  const chat = await loadChatFor(user, chatId, assertCanSend);
  if (!isWindowOpen(chat)) {
    throw new AppError(
      'WINDOW_EXPIRED',
      'The 24-hour reply window has closed; the client must message first',
    );
  }

  const { kind, maxBytes } = checkUploadRequest(body);
  const uploadId = ulid();
  const { url, fields } = await createUploadForm({
    uploadId,
    mimeType: body.mimeType,
    size: body.size,
    userId: user.userId,
  });

  return Response.json(
    { uploadId, kind, maxBytes, url, fields, expiresInSec: UPLOAD_EXPIRES_SEC },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
});
