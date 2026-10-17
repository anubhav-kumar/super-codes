import { MESSAGE_STATUSES, MESSAGE_TEXT_MAX, normalizePhone } from '@vartalap/core';

// Status values WhatsApp sends that we store; anything else (e.g. 'deleted') is ignored.
const WA_STATUSES = new Set(MESSAGE_STATUSES.filter((s) => s !== 'pending'));

// Last 4 digits only, safe to log.
export function phoneTail(raw) {
  return String(raw ?? '')
    .replace(/[^\d]/g, '')
    .slice(-4);
}

// Pure: Meta webhook payload → { messages, statuses, skipped }.
// Only changes for `phoneNumberId` are read. `skipped` lists items dropped, with log-safe reasons.
export function parseWebhook(payload, phoneNumberId) {
  const messages = [];
  const statuses = [];
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
        else messages.push(parsed);
      }

      for (const st of asArray(value.statuses)) {
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

  return { messages, statuses, skipped };
}

function parseMessage(msg, names) {
  const waMessageId = msg?.id;
  const from = msg?.from;
  if (!waMessageId) return { skip: { reason: 'missing_message_id' } };

  const chatId = normalizePhone(from);
  if (!chatId) return { skip: { reason: 'bad_phone', waMessageId, phoneTail: phoneTail(from) } };

  const text =
    msg.type === 'text' ? String(msg.text?.body ?? '') : `[unsupported: ${msg.type ?? 'unknown'}]`;
  const clientName = names.get(String(from)) || null;

  return { waMessageId, chatId, clientName, text: text.slice(0, MESSAGE_TEXT_MAX) };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
