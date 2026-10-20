// Shared constants and text helpers. Zero dependencies; runs unmodified in Node and browsers.

export const CHAT_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const AUTHOR_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const ASSET_FILE_RE = /^[0-9A-HJKMNP-TV-Z]{26}(\.[a-z0-9]{1,10})?$/;
export const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const MIME_RE = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/;

export const ZERO_ULID = '00000000000000000000000000';
export const PROTOCOL_VERSION = 1;

export const LIMITS = Object.freeze({
  MAX_TEXT_CHARS: 100_000,
  MAX_ASSETS_PER_MESSAGE: 10,
  MAX_ASSET_BYTES: 25 * 1024 * 1024,
  MAX_ASSET_NAME_CHARS: 200,
  MAX_JSON_BODY_BYTES: 1024 * 1024,
  MAX_TAIL: 1000,
});

export const EXT_MIME = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.jsonl': 'application/jsonl',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
});

export const INLINE_IMAGE_EXTS = Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

// Allows \t and \n. \r is also forbidden.
export const FORBIDDEN_CTRL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/;

// Module-private global regexes. Only used via String.prototype.matchAll / replace, which clone
// or reset them, so no lastIndex state leaks between calls.
const ASSET_REF_G = /(?<![\w:])asset:([0-9A-HJKMNP-TV-Z]{26})(?![0-9A-Za-z])/g;
const MENTION_G = /(?<![\w@])@([a-z0-9][a-z0-9_-]{0,31})/g;
const PLACEHOLDER_G = /asset:\$([1-9][0-9]?)(?![0-9])/g;
const TOKEN_G = new RegExp(
  [
    '(?<![\\w:])asset:(?<asset>[0-9A-HJKMNP-TV-Z]{26})(?![0-9A-Za-z])',
    '(?<![\\w@])@(?<mention>[a-z0-9][a-z0-9_-]{0,31})',
    '(?<url>https?:\\/\\/[^\\s<>]+)',
  ].join('|'),
  'g',
);
const URL_TRAILING = '.,;:!?)]\'"';
const ALL_CTRL_G = /[\u0000-\u001F\u007F]/g;

function uniqueMatches(text, re, map) {
  const out = [];
  const seen = new Set();
  for (const m of String(text).matchAll(re)) {
    const v = map(m[1]);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function extractAssetRefs(text) {
  return uniqueMatches(text, ASSET_REF_G, (v) => v);
}

export function extractMentions(text) {
  return uniqueMatches(text, MENTION_G, (v) => v);
}

export function findPlaceholders(text) {
  return uniqueMatches(text, PLACEHOLDER_G, (v) => Number(v));
}

export function resolvePlaceholders(text, assetIds) {
  const ids = assetIds ?? [];
  for (const n of findPlaceholders(text)) {
    if (n > ids.length) {
      return { ok: false, error: `text: placeholder asset:$${n} has no matching attachment` };
    }
  }
  const resolved = String(text).replace(PLACEHOLDER_G, (_, n) => `asset:${ids[Number(n) - 1]}`);
  return { ok: true, text: resolved };
}

export function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function sanitizeAssetName(name) {
  let s = String(name ?? '');
  const cut = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (cut !== -1) s = s.slice(cut + 1);
  s = s.replace(ALL_CTRL_G, '').trim();
  if (s.length > LIMITS.MAX_ASSET_NAME_CHARS) {
    s = s.slice(0, LIMITS.MAX_ASSET_NAME_CHARS);
    // Don't leave half a surrogate pair at the cut.
    const last = s.charCodeAt(s.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1);
    // Trim again so the function is idempotent (schema requires name === sanitizeAssetName(name)).
    s = s.trim();
  }
  return s === '' ? 'file' : s;
}

export function extOf(name) {
  const s = String(name ?? '');
  const i = s.lastIndexOf('.');
  if (i === -1) return '';
  const ext = s.slice(i).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

export function mimeForExt(ext) {
  return Object.hasOwn(EXT_MIME, ext) ? EXT_MIME[ext] : null;
}

// Ordered tokens for renderers. Joining every token's source text reproduces the input exactly
// (asset → 'asset:' + value, mention → '@' + value, url/text → value).
export function tokenizeText(text) {
  const src = String(text ?? '');
  const tokens = [];
  const pushText = (value) => {
    if (value === '') return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.type === 'text') prev.value += value;
    else tokens.push({ type: 'text', value });
  };
  let pos = 0;
  for (const m of src.matchAll(TOKEN_G)) {
    pushText(src.slice(pos, m.index));
    pos = m.index + m[0].length;
    const g = m.groups;
    if (g.asset !== undefined) {
      tokens.push({ type: 'asset', value: g.asset });
    } else if (g.mention !== undefined) {
      tokens.push({ type: 'mention', value: g.mention });
    } else {
      let url = g.url;
      let end = url.length;
      while (end > 0 && URL_TRAILING.includes(url[end - 1])) end--;
      const trailing = url.slice(end);
      url = url.slice(0, end);
      if (/^https?:\/\/.+/.test(url)) tokens.push({ type: 'url', value: url });
      else pushText(url);
      pushText(trailing);
    }
  }
  pushText(src.slice(pos));
  return tokens;
}
