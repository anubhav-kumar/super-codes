// F2: server-side media helpers for the API routes (S3 presigning, upload checks, scan status).
// Never log or return S3 keys, presigned URLs, captions or filenames.
import {
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  AppError,
  INLINE_MIME,
  OUTBOUND_MAX_BYTES,
  SCAN_CLEAN,
  SCAN_INFECTED,
  SCAN_TAG_KEY,
  baseMime,
  getConfig,
  getMediaConfig,
  mediaSummary,
  outboundKindForMime,
  outboundMediaKey,
  sanitizeFilename,
} from '@vartalap/core';

// Upload form and download links are short-lived (≤ 300 s), and never stored.
export const UPLOAD_EXPIRES_SEC = 300;
export const DOWNLOAD_EXPIRES_SEC = 300;

let client;

function s3() {
  client ??= new S3Client({ region: getConfig().region });
  return client;
}

function bucket() {
  try {
    return getMediaConfig().bucket;
  } catch {
    // Stack deployed without F2 yet: report it as a server problem, without details.
    throw new AppError('INTERNAL', 'Media storage is not configured');
  }
}

const formatMb = (bytes) => `${Math.round(bytes / 100000) / 10} MB`;

// Checks an upload request against the per-kind allowlist and limit. → { kind, maxBytes }.
export function checkUploadRequest({ mimeType, size }) {
  const kind = outboundKindForMime(mimeType);
  if (!kind) {
    throw new AppError('VALIDATION', 'This file type cannot be sent on WhatsApp', {
      issues: [{ path: ['mimeType'], message: 'Unsupported file type' }],
    });
  }
  const maxBytes = OUTBOUND_MAX_BYTES[kind];
  if (size > maxBytes) {
    throw new AppError('VALIDATION', `File is too large (max ${formatMb(maxBytes)} for ${kind})`, {
      issues: [{ path: ['size'], message: `Max ${formatMb(maxBytes)}` }],
    });
  }
  return { kind, maxBytes };
}

// Presigned POST (not PUT) so S3 itself enforces the size, type and key. The uploader's user ID
// is bound as object metadata and checked again when the message is sent.
export async function createUploadForm({ uploadId, mimeType, size, userId }) {
  const contentType = baseMime(mimeType);
  const { url, fields } = await createPresignedPost(s3(), {
    Bucket: bucket(),
    Key: outboundMediaKey(uploadId),
    Conditions: [
      ['content-length-range', size, size],
      ['eq', '$Content-Type', contentType],
      ['eq', '$x-amz-meta-uploader', userId],
    ],
    Fields: { 'Content-Type': contentType, 'x-amz-meta-uploader': userId },
    Expires: UPLOAD_EXPIRES_SEC,
  });
  return { url, fields };
}

// → { size, contentType, uploader } or null when the object doesn't exist.
async function headObject(key) {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return {
      size: res.ContentLength ?? 0,
      contentType: res.ContentType ?? null,
      uploader: res.Metadata?.uploader ?? null,
    };
  } catch (err) {
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

// Media send body ({ type, uploadId, caption?, filename? }) → the fields appendMessage needs.
// The uploadId becomes the message ID, so the S3 key is out/<messageId>.
export async function prepareOutboundMedia(body, user) {
  const key = outboundMediaKey(body.uploadId);
  const head = await headObject(key);
  if (!head || head.uploader !== user.userId) {
    throw new AppError('VALIDATION', 'Upload not found; attach the file again', {
      issues: [{ path: ['uploadId'], message: 'Upload not found' }],
    });
  }
  const mimeType = baseMime(head.contentType);
  if (outboundKindForMime(mimeType) !== body.type) {
    throw new AppError('VALIDATION', 'File type does not match the message type', {
      issues: [{ path: ['type'], message: 'Does not match the uploaded file' }],
    });
  }
  checkUploadRequest({ mimeType, size: head.size });

  const filename = sanitizeFilename(body.filename);
  const caption = body.type === 'audio' ? null : body.caption || null;
  return {
    messageId: body.uploadId,
    type: body.type,
    text: mediaSummary(body.type, { caption, filename }),
    media: {
      waMediaId: null,
      s3Key: key,
      mimeType,
      size: head.size,
      filename,
      caption,
      state: 'ready',
    },
  };
}

// → 'clean' | 'pending' | 'blocked' | 'unscannable' | 'missing'. Without required scanning, only existence.
export async function mediaAvailability(key) {
  if (!getMediaConfig().scanRequired) {
    return (await headObject(key)) ? 'clean' : 'missing';
  }
  let tags;
  try {
    ({ TagSet: tags = [] } = await s3().send(
      new GetObjectTaggingCommand({ Bucket: bucket(), Key: key }),
    ));
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return 'missing';
    throw err;
  }
  const status = tags.find((t) => t.Key === SCAN_TAG_KEY)?.Value ?? null;
  if (status === SCAN_CLEAN) return 'clean';
  if (!status) return 'pending';
  // THREATS_FOUND, and also UNSUPPORTED / ACCESS_DENIED / FAILED: never shown unscanned.
  return status === SCAN_INFECTED ? 'blocked' : 'unscannable';
}

// Short-lived GET link. Documents and anything not safe to render inline are attachments.
export async function presignDownload({ key, kind, mimeType, filename }) {
  const contentType = baseMime(mimeType) || 'application/octet-stream';
  const inline = kind !== 'document' && INLINE_MIME.has(contentType);
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseCacheControl: 'private, no-store',
      ResponseContentType: contentType,
      ResponseContentDisposition: inline ? 'inline' : attachmentDisposition(filename, kind),
    }),
    { expiresIn: DOWNLOAD_EXPIRES_SEC },
  );
}

function attachmentDisposition(filename, kind) {
  const name = sanitizeFilename(filename) || `${kind || 'file'}`;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
