// F2 media: kinds, MIME allowlists and size limits. Pure, browser-safe values; a copy of the
// outbound part lives in apps/web/lib/constants.js (client components can't import core).

// Message types that carry a file (a `media` object on the message).
export const MEDIA_KINDS = ['image', 'video', 'audio', 'document', 'sticker'];

// Kinds an agent may send (F2 P2 + P3). Stickers and voice-note recording are not sent.
export const OUTBOUND_MEDIA_KINDS = ['image', 'video', 'audio', 'document'];

// The file's own lifecycle, separate from the message's delivery status.
export const MEDIA_STATES = ['pending', 'ready', 'failed', 'too_large', 'expired'];

// Meta's caption limit (documented for images; assumed for video and documents).
export const MEDIA_CAPTION_MAX = 1024;
export const MEDIA_FILENAME_MAX = 240;

// Meta doesn't say whether "MB" is decimal or binary, so decimal (the smaller) is the margin.
const MB = 1000 * 1000;
const KB = 1000;

// Inbound: whatever Meta delivers, capped at its own 100 MB limit.
export const INBOUND_MAX_BYTES = 100 * MB;

// Outbound limits per kind. Documents are capped at 16 MB in F2 (decision D3), not Meta's 100 MB.
export const OUTBOUND_MAX_BYTES = Object.freeze({
  image: 5 * MB,
  video: 16 * MB,
  audio: 16 * MB,
  document: 16 * MB,
});

export const STICKER_MAX_BYTES = 500 * KB;

// MIME allowlists (base type, lowercase, no parameters). Never text/html, image/svg+xml etc.
export const MIME_BY_KIND = Object.freeze({
  image: ['image/jpeg', 'image/png'],
  video: ['video/mp4', 'video/3gpp'],
  audio: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'],
  document: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  sticker: ['image/webp'],
});

// Inbound documents can be anything the client attaches; they are always served as downloads
// (Content-Disposition: attachment) and stored with a safe Content-Type.
export const SAFE_DOWNLOAD_MIME = 'application/octet-stream';

// Types that are safe to render inline in the browser (img / audio / video elements).
export const INLINE_MIME = new Set([
  ...MIME_BY_KIND.image,
  ...MIME_BY_KIND.video,
  ...MIME_BY_KIND.audio,
  ...MIME_BY_KIND.sticker,
  'audio/opus',
  'audio/webm',
  'video/webm',
  'image/gif',
  'image/webp',
]);

// "audio/ogg; codecs=opus" → "audio/ogg".
export function baseMime(mime) {
  return String(mime ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

// Outbound kind for a MIME type, or null when it isn't sendable.
export function outboundKindForMime(mime) {
  const base = baseMime(mime);
  return OUTBOUND_MEDIA_KINDS.find((kind) => MIME_BY_KIND[kind].includes(base)) ?? null;
}

// Stored Content-Type for an inbound object of `kind`: the base MIME if it is on that kind's
// allowlist (or inline-safe for media kinds), otherwise a download-only type.
export function storedMimeFor(kind, mime) {
  const base = baseMime(mime);
  if (MIME_BY_KIND[kind]?.includes(base)) return base;
  if (kind !== 'document' && INLINE_MIME.has(base)) return base;
  return SAFE_DOWNLOAD_MIME;
}

// Basename only, no control or path characters, bounded length. Used for display and the
// Content-Disposition of downloads.
export function sanitizeFilename(name) {
  const base = String(name ?? '')
    .split(/[\\/]/)
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '_')
    .trim();
  return base.slice(0, MEDIA_FILENAME_MAX) || null;
}
