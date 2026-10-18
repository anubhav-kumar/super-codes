// F2 mediaFetch: copies inbound WhatsApp media into S3 (in/<messageId>) and marks it ready.
// Standard SQS queue, batchSize 1. Throwing makes SQS redeliver; after maxReceiveCount the job
// goes to the DLQ, and the last attempt marks the media failed so the UI stops showing "loading".
// Logs carry messageId, mime type, size and state only: never captions, filenames, Meta URLs,
// presigned URLs or phone numbers.
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import {
  INBOUND_MAX_BYTES,
  MediaFetchQueueMessageSchema,
  SNIFF_BYTES,
  baseMime,
  checkMagicBytes,
  getMessage,
  inboundMediaKey,
  setMediaState,
  storedMimeFor,
} from '@vartalap/core';
import { deleteObject, uploadStream } from '../lib/s3.js';
import { WhatsAppSendError } from '../whatsapp/client.js';
import { MediaGoneError, downloadMedia, resolveMedia } from '../whatsapp/media.js';

// Keep in sync with maxReceiveCount on MediaFetchQueue in serverless.yml.
const MAX_RECEIVE_COUNT = 5;

// Leaves headroom inside the 120 s Lambda timeout to record the outcome.
const DOWNLOAD_TIMEOUT_MS = 100_000;

class TooLargeError extends Error {
  constructor() {
    super('Media is larger than the inbound limit');
    this.name = 'TooLargeError';
  }
}

export async function handler(event) {
  for (const record of event.Records ?? []) {
    await processRecord(record);
  }
}

async function processRecord(record) {
  const receiveCount = Number(record.attributes?.ApproximateReceiveCount ?? 1);
  const job = parseJob(record);
  if (!job) {
    log('warn', 'media.malformed', { sqsMessageId: record.messageId });
    return;
  }

  const ctx = { messageId: job.messageId, receiveCount };
  const message = await getMessage(job.messageId);
  if (!message?.media) {
    log('warn', 'media.not_found', ctx);
    return;
  }
  if (message.media.state !== 'pending') {
    log('info', 'media.skipped', { ...ctx, state: message.media.state });
    return; // Already done (a duplicate job or a redelivery).
  }
  if (!message.media.waMediaId) {
    await finish(ctx, 'failed', { errorCode: 'NO_MEDIA_ID' });
    return;
  }

  try {
    const result = await fetchToS3(message);
    const { applied } = await setMediaState(message.messageId, {
      state: 'ready',
      from: ['pending'],
      s3Key: result.key,
      size: result.size,
      mimeType: result.contentType,
      errorCode: null,
    });
    log('info', 'media.ready', { ...ctx, mimeType: result.contentType, size: result.size, applied });
  } catch (err) {
    await handleFailure(err, ctx, receiveCount);
  }
}

async function fetchToS3(message) {
  const kind = message.type;
  const meta = await resolveMedia(message.media.waMediaId);
  if (meta.size != null && meta.size > INBOUND_MAX_BYTES) throw new TooLargeError();

  const declared = baseMime(meta.mimeType ?? message.media.mimeType);
  // Never stores text/html, svg or unknown types as inline-renderable content.
  const contentType = storedMimeFor(kind, declared);
  const key = inboundMediaKey(message.messageId);

  const res = await downloadMedia(meta.url, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  const inspector = createInspector();
  await uploadStream({
    key,
    body: Readable.fromWeb(res.body).pipe(inspector.stream),
    contentType,
  });

  const { size, head, sha256 } = inspector.result();
  const sniff = checkMagicBytes(head, declared);
  if (!sniff.ok) {
    await deleteObject(key).catch(() => {});
    const err = new Error(`Content check failed: ${sniff.reason}`);
    err.name = 'ContentCheckError';
    err.errorCode = `CONTENT_${sniff.reason.toUpperCase()}`;
    throw err;
  }
  // Meta documents a sha256 per file but not its encoding (hex or base64): unverified, so a
  // mismatch is logged rather than rejected. Verify on dev and tighten this if it is reliable.
  if (meta.sha256 && meta.sha256 !== sha256.hex && meta.sha256 !== sha256.base64) {
    log('warn', 'media.sha256_mismatch', { messageId: message.messageId });
  }
  return { key, size, contentType };
}

// Pass-through stream that counts bytes, keeps the first SNIFF_BYTES and hashes the content.
function createInspector() {
  const hash = createHash('sha256');
  let size = 0;
  let head = Buffer.alloc(0);
  let digest;
  const stream = new Transform({
    transform(chunk, _enc, callback) {
      size += chunk.length;
      if (size > INBOUND_MAX_BYTES) return callback(new TooLargeError());
      if (head.length < SNIFF_BYTES) {
        head = Buffer.concat([head, chunk.subarray(0, SNIFF_BYTES - head.length)]);
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  return {
    stream,
    result() {
      digest ??= hash.digest();
      return { size, head, sha256: { hex: digest.toString('hex'), base64: digest.toString('base64') } };
    },
  };
}

async function handleFailure(err, ctx, receiveCount) {
  if (err instanceof MediaGoneError) return finish(ctx, 'expired', { errorCode: 'MEDIA_EXPIRED' });
  // By name: the error may surface through the S3 upload's stream handling.
  if (err?.name === 'TooLargeError') return finish(ctx, 'too_large', { errorCode: '131052' });
  if (err.name === 'ContentCheckError') return finish(ctx, 'failed', { errorCode: err.errorCode });
  if (err instanceof WhatsAppSendError && !err.retryable) {
    return finish(ctx, 'failed', { errorCode: err.code });
  }

  const errorCode = err instanceof WhatsAppSendError ? err.code : 'INTERNAL';
  if (receiveCount >= MAX_RECEIVE_COUNT) {
    await finish(ctx, 'failed', { errorCode }).catch((updateErr) =>
      log('error', 'media.mark_failed_error', { ...ctx, error: describe(updateErr) }),
    );
    log('error', 'media.giving_up', { ...ctx, errorCode, error: describe(err) });
  } else {
    log('warn', 'media.retrying', { ...ctx, errorCode, error: describe(err) });
  }
  throw err;
}

async function finish(ctx, state, { errorCode }) {
  const { applied } = await setMediaState(ctx.messageId, { state, from: ['pending'], errorCode });
  log(state === 'failed' ? 'warn' : 'info', `media.${state}`, { ...ctx, errorCode, applied });
}

function parseJob(record) {
  try {
    const result = MediaFetchQueueMessageSchema.safeParse(JSON.parse(record.body));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function describe(err) {
  return { name: err?.name, message: err?.message };
}

function log(level, event, fields) {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
