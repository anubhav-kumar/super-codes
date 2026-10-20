// Zod schemas + canonical serialization. Node only.
import { z } from 'zod';
import {
  CHAT_ID_RE, AUTHOR_RE, ULID_RE, ASSET_FILE_RE, ISO_TS_RE, MIME_RE, LIMITS, FORBIDDEN_CTRL_RE,
  extOf, sanitizeAssetName, findPlaceholders,
} from './constants.js';
import { ulidTime } from './ulid.js';

const mustMatch = (re) => `must match ${re.source}`;

export const ChatIdSchema = z.string().regex(CHAT_ID_RE, mustMatch(CHAT_ID_RE));
export const AuthorSchema = z.string().regex(AUTHOR_RE, mustMatch(AUTHOR_RE));
export const UlidSchema = z.string().regex(ULID_RE, mustMatch(ULID_RE));

export const AssetSchema = z
  .strictObject({
    id: UlidSchema,
    file: z.string().regex(ASSET_FILE_RE, mustMatch(ASSET_FILE_RE)),
    name: z.string().min(1).max(LIMITS.MAX_ASSET_NAME_CHARS),
    mime: z.string().regex(MIME_RE, mustMatch(MIME_RE)),
    size: z.number().int().min(0).max(LIMITS.MAX_ASSET_BYTES),
  })
  .superRefine((a, ctx) => {
    if (typeof a.name !== 'string' || typeof a.id !== 'string') return;
    if (a.name !== sanitizeAssetName(a.name)) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'must be a sanitized file name' });
    }
    if (a.file !== a.id + extOf(a.name)) {
      ctx.addIssue({ code: 'custom', path: ['file'], message: 'must equal id + extension of name' });
    }
  });

export const MessageSchema = z
  .strictObject({
    id: UlidSchema,
    chatId: ChatIdSchema,
    ts: z.string().regex(ISO_TS_RE, mustMatch(ISO_TS_RE)),
    author: AuthorSchema,
    text: z.string().max(LIMITS.MAX_TEXT_CHARS),
    assets: z.array(AssetSchema).max(LIMITS.MAX_ASSETS_PER_MESSAGE),
  })
  .superRefine((m, ctx) => {
    if (typeof m.text !== 'string' || !Array.isArray(m.assets)) return;
    if (typeof m.id === 'string' && ULID_RE.test(m.id) && m.ts !== new Date(ulidTime(m.id)).toISOString()) {
      ctx.addIssue({ code: 'custom', path: ['ts'], message: 'must equal the timestamp encoded in id' });
    }
    if (m.text.includes('\r')) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'must not contain \\r (use \\n)' });
    }
    if (FORBIDDEN_CTRL_RE.test(m.text)) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'must not contain control characters' });
    }
    if (findPlaceholders(m.text).length > 0) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'must not contain asset:$N placeholders' });
    }
    if (m.text.trim() === '' && m.assets.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'must not be empty when there are no assets' });
    }
    const seen = new Set();
    m.assets.forEach((a, i) => {
      if (seen.has(a.id)) {
        ctx.addIssue({ code: 'custom', path: ['assets', i, 'id'], message: 'duplicate asset id' });
      }
      seen.add(a.id);
      if (!(a.id < m.id)) {
        ctx.addIssue({ code: 'custom', path: ['assets', i, 'id'], message: 'must be less than message id' });
      }
    });
  });

export const ChatSummarySchema = z.strictObject({
  id: ChatIdSchema,
  messageCount: z.number().int().min(0),
  lastMessageAt: z.string().regex(ISO_TS_RE, mustMatch(ISO_TS_RE)).nullable(),
});

export const SendInputSchema = z.strictObject({
  author: AuthorSchema,
  text: z.string().max(LIMITS.MAX_TEXT_CHARS),
});

function canonicalAsset(a) {
  return { id: a.id, file: a.file, name: a.name, mime: a.mime, size: a.size };
}

export function serializeMessage(m) {
  return JSON.stringify({
    id: m.id,
    chatId: m.chatId,
    ts: m.ts,
    author: m.author,
    text: m.text,
    assets: (m.assets ?? []).map(canonicalAsset),
  });
}

export function serializeChatSummary(c) {
  return JSON.stringify({ id: c.id, messageCount: c.messageCount, lastMessageAt: c.lastMessageAt });
}

export function formatZodError(err) {
  return (err?.issues ?? [])
    .map((i) => (i.path && i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

export function parseMessageLine(line) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch (err) {
    return { ok: false, code: 'invalid_json', error: err.message };
  }
  const r = MessageSchema.safeParse(raw);
  if (!r.success) return { ok: false, code: 'schema', error: formatZodError(r.error) };
  if (serializeMessage(r.data) !== line) {
    return { ok: false, code: 'not_canonical', error: 'line is not in canonical serialization' };
  }
  return { ok: true, message: r.data };
}
