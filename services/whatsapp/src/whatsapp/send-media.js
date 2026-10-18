// F2: outbound media for the sender Lambda. The agent's file is already in S3 (out/<messageId>);
// it is uploaded to Meta once (the media ID is cached on the message for retries) and then sent.
import {
  OUTBOUND_MAX_BYTES,
  SCAN_CLEAN,
  SCAN_INFECTED,
  SNIFF_BYTES,
  checkMagicBytes,
  getMediaConfig,
  setOutboundWaMediaId,
} from '@vartalap/core';
import { getObjectBytes, getScanStatus } from '../lib/s3.js';
import { WhatsAppSendError, sendMedia } from './client.js';
import { uploadMedia } from './media.js';

// GuardDuty usually tags a small object within seconds; wait briefly, then let SQS retry.
const SCAN_WAIT_MS = 15_000;
const SCAN_POLL_MS = 2_000;

// log(event, fields): sender's logger, already carrying messageId and the masked phone.
// → { waMessageId }. Throws WhatsAppSendError (retryable or final).
export async function sendMediaMessage(message, log) {
  const { media } = message;
  if (!media.s3Key) throw final('Media message has no file', 'NO_MEDIA');

  let waMediaId = media.waMediaId;
  if (!waMediaId) {
    if (getMediaConfig().scanRequired) await waitForCleanScan(media.s3Key);

    const { data } = await getObjectBytes(media.s3Key);
    const limit = OUTBOUND_MAX_BYTES[message.type];
    if (!limit || data.length > limit) throw final('File is over the size limit', 'TOO_LARGE');
    const sniff = checkMagicBytes(data.subarray(0, SNIFF_BYTES), media.mimeType);
    if (!sniff.ok) throw final('File content does not match its type', 'CONTENT_MISMATCH');

    waMediaId = await uploadMedia({ data, mimeType: media.mimeType, filename: media.filename });
    log('sender.media_uploaded', { mimeType: media.mimeType, size: data.length });
    // Cache for a retry of the send below; losing it only costs a second upload.
    await setOutboundWaMediaId(message.messageId, waMediaId).catch((err) =>
      log('sender.media_cache_failed', { error: err?.name }),
    );
  }

  return sendMedia({
    to: message.chatId,
    kind: message.type,
    waMediaId,
    caption: media.caption,
    filename: media.filename,
  });
}

async function waitForCleanScan(key) {
  const deadline = Date.now() + SCAN_WAIT_MS;
  for (;;) {
    const status = await getScanStatus(key);
    if (status === SCAN_CLEAN) return;
    if (status === SCAN_INFECTED) throw final('File failed the malware scan', 'MALWARE');
    if (status) throw final(`File could not be scanned (${status})`, 'SCAN_FAILED');
    if (Date.now() >= deadline) {
      throw new WhatsAppSendError('Malware scan not finished yet', {
        retryable: true,
        code: 'SCAN_PENDING',
      });
    }
    await new Promise((resolve) => setTimeout(resolve, SCAN_POLL_MS));
  }
}

function final(message, code) {
  return new WhatsAppSendError(message, { retryable: false, code });
}
