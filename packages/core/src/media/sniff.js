// Magic-byte sniffing (decision D9): checks that a file's first bytes match its declared kind,
// so a renamed executable or HTML page can't pass as a photo. Pure JS, no dependencies.
// `head` is a Buffer/Uint8Array with at least the first 64 bytes (or the whole file if shorter).

const SIGNATURES = [
  { type: 'image/jpeg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { type: 'image/png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: 'image/gif', test: (b) => ascii(b, 0, 4) === 'GIF8' },
  { type: 'image/webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  { type: 'application/pdf', test: (b) => ascii(b, 0, 5) === '%PDF-' },
  { type: 'audio/ogg', test: (b) => ascii(b, 0, 4) === 'OggS' },
  { type: 'audio/amr', test: (b) => ascii(b, 0, 5) === '#!AMR' },
  { type: 'audio/mpeg', test: (b) => ascii(b, 0, 3) === 'ID3' || isMpegFrame(b) },
  { type: 'audio/aac', test: (b) => b.length > 1 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0 },
  // ISO base media (mp4, m4a, 3gp, mov): "ftyp" box at offset 4.
  { type: 'iso-bmff', test: (b) => ascii(b, 4, 4) === 'ftyp' },
  { type: 'webm', test: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  // Office Open XML (docx/xlsx/pptx) and other zip containers.
  { type: 'zip', test: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  // Legacy Office (doc/xls/ppt): OLE compound file.
  { type: 'ole', test: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
];

// Content that must never be stored as media, whatever the declared type.
const DANGEROUS = [
  (b) => startsWith(b, [0x4d, 0x5a]), // MZ: Windows executable
  (b) => startsWith(b, [0x7f, 0x45, 0x4c, 0x46]), // ELF
  (b) => /^\s*<(!doctype html|html|script|svg|\?xml)/i.test(ascii(b, 0, Math.min(b.length, 64))),
];

// Which sniffed signatures are acceptable for each declared base MIME type.
const ACCEPTS = {
  'image/jpeg': ['image/jpeg'],
  'image/png': ['image/png'],
  'image/webp': ['image/webp'],
  'image/gif': ['image/gif'],
  'video/mp4': ['iso-bmff'],
  'video/3gpp': ['iso-bmff'],
  'video/webm': ['webm'],
  'audio/mp4': ['iso-bmff'],
  'audio/ogg': ['audio/ogg'],
  'audio/opus': ['audio/ogg'],
  'audio/amr': ['audio/amr'],
  'audio/mpeg': ['audio/mpeg'],
  'audio/aac': ['audio/aac', 'iso-bmff'],
  'audio/webm': ['webm'],
  'application/pdf': ['application/pdf'],
  'application/msword': ['ole'],
  'application/vnd.ms-excel': ['ole'],
  'application/vnd.ms-powerpoint': ['ole'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['zip'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['zip'],
};

export const SNIFF_BYTES = 64;

export function sniffType(head) {
  const bytes = toBytes(head);
  return SIGNATURES.find((s) => s.test(bytes))?.type ?? null;
}

// → { ok: true } or { ok: false, reason: 'dangerous' | 'mismatch' | 'empty' }.
// Types without a known signature (text/plain, other inbound documents) pass unless the content
// looks dangerous; inbound documents of other types are stored as application/octet-stream and
// served as downloads only.
export function checkMagicBytes(head, declaredMime) {
  const bytes = toBytes(head);
  if (!bytes.length) return { ok: false, reason: 'empty' };
  if (DANGEROUS.some((test) => test(bytes))) return { ok: false, reason: 'dangerous' };
  const accepted = ACCEPTS[String(declaredMime ?? '').toLowerCase()];
  if (!accepted) return { ok: true };
  return accepted.includes(sniffType(bytes)) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

function toBytes(head) {
  if (!head) return new Uint8Array(0);
  return head instanceof Uint8Array ? head : new Uint8Array(head);
}

function startsWith(b, sig) {
  return b.length >= sig.length && sig.every((v, i) => b[i] === v);
}

function ascii(b, offset, length) {
  let out = '';
  for (let i = offset; i < offset + length && i < b.length; i++) out += String.fromCharCode(b[i]);
  return out;
}

// MPEG audio frame sync: 11 set bits, a valid layer.
function isMpegFrame(b) {
  return b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0;
}
