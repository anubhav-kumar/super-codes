import {
  MESSAGE_STATUSES,
  MESSAGE_TEXT_MAX,
  TOO_LARGE_TEXT,
  mediaSummary,
  normalizePhone,
  sanitizeFilename,
  unsupportedSummary,
} from '@vartalap/core';

// Status values WhatsApp sends that we store; anything else (e.g. 'deleted') is ignored.
const WA_STATUSES = new Set(MESSAGE_STATUSES.filter((s) => s !== 'pending'));

// F2 decision D8: the voice-note 'played' status is ignored quietly (not logged as unknown).
const IGNORED_STATUSES = new Set(['played']);

// F2: inbound types carrying a Meta media ID, fetched later by the mediaFetch Lambda.
const FILE_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

// Meta error: inbound media over 100 MB.
const TOO_LARGE_CODE = '131052';

// Last 4 digits only, safe to log.
export function phoneTail(raw) {
  return String(raw ?? '')
    .replace(/[^\d]/g, '')
    .slice(-4);
}

// Pure: Meta webhook payload → { messages, statuses, reactions, skipped }.
// Only changes for `phoneNumberId` are read. `skipped` lists items dropped, with log-safe reasons.
export function parseWebhook(payload, phoneNumberId) {
  const messages = [];
  const statuses = [];
  const reactions = [];
  const skipped = [];

  for (const entry of asArray(payload?.entry)) {
    for (const change of asArray(entry?.changes)) {
      const value = change?.value;
      if (!value || change.field !== 'messages') continue;
      if (String(value.metadata?.phone_number_id ?? '') !== String(phoneNumberId)) {
        skipped.push({ reason: 'other_phone_number_id' });
        continue;
      }

      const names = new Map(
        asArray(value.contacts).map((c) => [String(c?.wa_id ?? ''), c?.profile?.name]),
      );

      for (const msg of asArray(value.messages)) {
        const parsed = parseMessage(msg, names);
        if (parsed.skip) skipped.push(parsed.skip);
        else if (parsed.reaction) reactions.push(parsed.reaction);
        else messages.push(parsed);
      }

      for (const st of asArray(value.statuses)) {
        if (IGNORED_STATUSES.has(st?.status)) continue;
        if (!st?.id || !WA_STATUSES.has(st.status)) {
          skipped.push({ reason: 'unknown_status', waMessageId: st?.id, status: st?.status });
          continue;
        }
        const code = st.errors?.[0]?.code;
        statuses.push({
          waMessageId: st.id,
          status: st.status,
          errorCode: code == null ? null : String(code),
        });
      }
    }
  }

  return { messages, statuses, reactions, skipped };
}

// One inbound message → { waMessageId, chatId, clientName, type, text, media?, location?,
// contacts? }, or { reaction } for a reaction, or { skip }. Captions, filenames, coordinates and
// contact names are kept on the result but must never be logged.
function parseMessage(msg, names) {
  const waMessageId = msg?.id;
  const from = msg?.from;
  if (!waMessageId) return { skip: { reason: 'missing_message_id' } };

  const chatId = normalizePhone(from);
  if (!chatId) return { skip: { reason: 'bad_phone', waMessageId, phoneTail: phoneTail(from) } };

  if (msg.type === 'reaction') {
    const target = msg.reaction?.message_id;
    if (!target) return { skip: { reason: 'reaction_without_target', waMessageId } };
    const emoji = typeof msg.reaction?.emoji === 'string' ? msg.reaction.emoji : null;
    return { reaction: { waMessageId, chatId, targetWaMessageId: target, emoji: emoji || null } };
  }

  const clientName = names.get(String(from)) || null;
  const body = parseBody(msg);
  return {
    waMessageId,
    chatId,
    clientName,
    ...body,
    text: String(body.text ?? '').slice(0, MESSAGE_TEXT_MAX),
  };
}

// → { type, text, media?, location?, contacts? } for every non-reaction type.
function parseBody(msg) {
  const type = msg.type;
  const errorCodes = asArray(msg.errors).map((e) => String(e?.code ?? ''));

  if (type === 'text') return { type: 'text', text: String(msg.text?.body ?? '') };

  if (FILE_TYPES.has(type)) {
    const obj = msg[type] ?? {};
    const caption = type === 'audio' || type === 'sticker' ? null : stringOrNull(obj.caption);
    const filename = type === 'document' ? sanitizeFilename(obj.filename) : null;
    const voice = type === 'audio' ? obj.voice === true : undefined;
    const tooLarge = errorCodes.includes(TOO_LARGE_CODE);
    const waMediaId = stringOrNull(obj.id);
    const media = {
      waMediaId: tooLarge ? null : waMediaId,
      s3Key: null,
      mimeType: stringOrNull(obj.mime_type),
      sha256: stringOrNull(obj.sha256),
      filename,
      caption,
      state: tooLarge ? 'too_large' : waMediaId ? 'pending' : 'failed',
      errorCode: tooLarge ? TOO_LARGE_CODE : waMediaId ? null : 'NO_MEDIA_ID',
    };
    if (voice !== undefined) media.voice = voice;
    if (type === 'sticker') media.animated = obj.animated === true;
    const text = tooLarge ? TOO_LARGE_TEXT : mediaSummary(type, { caption, voice, filename });
    return { type, text, media };
  }

  if (type === 'location') {
    const loc = msg.location ?? {};
    const latitude = Number(loc.latitude);
    const longitude = Number(loc.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { type: 'unsupported', text: unsupportedSummary('location') };
    }
    const location = {
      latitude,
      longitude,
      name: stringOrNull(loc.name)?.slice(0, 1000) ?? null,
      address: stringOrNull(loc.address)?.slice(0, 1000) ?? null,
    };
    return { type, text: mediaSummary('location', { name: location.name }), location };
  }

  if (type === 'contacts') {
    // Decision D6: name and phone count only; emails, addresses, numbers etc. are dropped.
    const contacts = asArray(msg.contacts)
      .slice(0, 20)
      .map((c) => ({
        formattedName: stringOrNull(c?.name?.formatted_name)?.slice(0, 200) ?? null,
        phoneCount: asArray(c?.phones).length,
      }));
    const first = contacts[0]?.formattedName;
    const more = contacts.length > 1 ? ` (+${contacts.length - 1} more)` : '';
    return { type, text: `${mediaSummary('contacts', { name: first })}${more}`, contacts };
  }

  if (type === 'interactive') {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    return { type, text: stringOrNull(reply?.title) ?? '[Interactive reply]' };
  }

  if (type === 'button') {
    return { type, text: stringOrNull(msg.button?.text) ?? '[Button reply]' };
  }

  if (errorCodes.includes(TOO_LARGE_CODE)) return { type: 'unsupported', text: TOO_LARGE_TEXT };

  // 'unsupported' (polls, edits, video notes?) and any type we don't know yet.
  const kind = type === 'unsupported' ? msg.unsupported?.type : type;
  return { type: 'unsupported', text: unsupportedSummary(kind) };
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
