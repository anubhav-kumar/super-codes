import { MESSAGE_TEXT_MAX } from '../schemas/message.js';

// Text stored on every non-text message. It drives lastMessagePreview and is the fallback the
// UI shows when it can't render the media. Captions are appended; nothing else is.
const LABELS = {
  image: '[Photo]',
  video: '[Video]',
  audio: '[Audio]',
  document: '[Document]',
  sticker: '[Sticker]',
  location: '[Location]',
  contacts: '[Contact]',
};

export function mediaSummary(type, { caption, voice, filename, name } = {}) {
  let label = LABELS[type] ?? '[Message]';
  if (type === 'audio' && voice) label = '[Voice note]';
  const detail = [type === 'document' ? filename : null, name, caption]
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim())
    .join(' ');
  return (detail ? `${label} ${detail}` : label).slice(0, MESSAGE_TEXT_MAX);
}

export const TOO_LARGE_TEXT = '[File too large to receive]';

// Placeholder for a video note, if one arrives as `unsupported` (behaviour unverified, F2 P3).
export const VIDEO_NOTE_TEXT =
  '[Video note: not supported by the WhatsApp Cloud API. Ask the client to send it as a video.]';

export function unsupportedSummary(kind) {
  const label = String(kind ?? '').replace(/[^a-z0-9_]/gi, '').slice(0, 40);
  if (/video_?note|round_?video|ptv/i.test(label)) return VIDEO_NOTE_TEXT;
  return label ? `[Unsupported message: ${label.replace(/_/g, ' ')}]` : '[Unsupported message]';
}
