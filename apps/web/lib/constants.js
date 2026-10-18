// Browser-safe copies of @vartalap/core constants. The core entry point pulls in the AWS SDK
// and bcrypt, so client components must not import it. Keep these in sync with
// packages/core/src/schemas (chat.js UNASSIGNED, message.js MESSAGE_TEXT_MAX, user.js limits).
export const UNASSIGNED = 'UNASSIGNED';
export const MESSAGE_TEXT_MAX = 4096;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

// F4: client attribute limits (packages/core/src/schemas/client.js, clients/normalize-tag.js).
export const DESCRIPTION_MAX = 1000;
export const NOTE_BODY_MAX = 2000;
export const TAG_MAX_LENGTH = 32;
export const MAX_TAGS_PER_CHAT = 10;
export const NOTE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const TAG_REGEX = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{0,31}$/u;

// Same normalization as core's normalizeTag, to preview what will be stored.
export function normalizeTag(raw) {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '-');
}

// F2: outbound media (packages/core/src/media/constants.js). Decimal MB, as a safety margin.
export const MEDIA_CAPTION_MAX = 1024;
export const OUTBOUND_MEDIA = Object.freeze({
  image: { maxBytes: 5_000_000, mimes: ['image/jpeg', 'image/png'] },
  video: { maxBytes: 16_000_000, mimes: ['video/mp4', 'video/3gpp'] },
  audio: {
    maxBytes: 16_000_000,
    mimes: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'],
  },
  document: {
    maxBytes: 16_000_000,
    mimes: [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
});
export const ATTACH_ACCEPT = Object.values(OUTBOUND_MEDIA)
  .flatMap((k) => k.mimes)
  .join(',');

// Browsers sometimes report an empty or odd type; fall back to the extension.
const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  aac: 'audio/aac',
  amr: 'audio/amr',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// File → { kind, mimeType } or { error } (checked before any upload starts).
export function classifyFile(file) {
  const ext = String(file?.name ?? '').split('.').pop().toLowerCase();
  const declared = String(file?.type ?? '').split(';')[0].trim().toLowerCase();
  const candidates = [declared, MIME_BY_EXTENSION[ext]].filter(Boolean);
  for (const mimeType of candidates) {
    for (const [kind, { maxBytes, mimes }] of Object.entries(OUTBOUND_MEDIA)) {
      if (!mimes.includes(mimeType)) continue;
      if (file.size > maxBytes) {
        return { error: `Too large: ${kind} files can be up to ${maxBytes / 1_000_000} MB.` };
      }
      if (file.size === 0) return { error: 'The file is empty.' };
      return { kind, mimeType };
    }
  }
  return { error: 'WhatsApp can’t send this file type. Use JPEG/PNG, MP4, MP3/AAC/OGG or PDF/Office.' };
}
