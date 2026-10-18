// F2: GET /api/chats/[id]/messages/[messageId]/media → 302 to a short-lived presigned S3 URL.
// Access is checked on every request (assertCanView), so a reassigned agent loses access at
// once; <img>/<audio>/<video> src work with the session cookie and never hold S3 URLs.
import { AppError, assertCanView, getMessage, setMediaState } from '@vartalap/core';
import { getChatId, loadChatFor, requireUser, withHandler } from '../../../../../../../lib/api.js';
import { mediaAvailability, presignDownload } from '../../../../../../../lib/media.js';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const chatId = await getChatId(context);
  const chat = await loadChatFor(user, chatId, assertCanView);

  const { messageId } = await context.params;
  const id = String(messageId ?? '');
  const message = id && id.length <= 64 ? await getMessage(id) : null;
  if (!message || message.chatId !== chat.chatId || !message.media) {
    throw new AppError('NOT_FOUND', 'Media not found');
  }

  const { media } = message;
  if (media.state === 'pending') throw new AppError('MEDIA_PENDING', 'Media is still loading');
  if (media.state !== 'ready' || !media.s3Key) {
    throw new AppError('MEDIA_UNAVAILABLE', 'Media is not available', { state: media.state });
  }

  const availability = await mediaAvailability(media.s3Key);
  if (availability === 'pending') {
    throw new AppError('MEDIA_PENDING', 'Media is being scanned for malware');
  }
  if (availability === 'missing') {
    // Removed by the retention lifecycle rule (or a deletion request): record it lazily.
    await setMediaState(message.messageId, { state: 'expired', from: ['ready'] }).catch(() => {});
    throw new AppError('MEDIA_UNAVAILABLE', 'Media has expired', { state: 'expired' });
  }
  if (availability !== 'clean') {
    throw new AppError('MEDIA_UNAVAILABLE', 'Media was blocked by the malware scan', {
      state: availability,
    });
  }

  const url = await presignDownload({
    key: media.s3Key,
    kind: message.type,
    mimeType: media.mimeType,
    filename: media.filename,
  });
  return new Response(null, {
    status: 302,
    headers: { Location: url, ...NO_STORE, 'Referrer-Policy': 'no-referrer' },
  });
});
