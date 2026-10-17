import { timingSafeEqual } from 'node:crypto';
import { appendMessage, getMessageByWaId, updateStatus } from '@vartalap/core';
import { getParams } from '../lib/params.js';
import { parseWebhook, phoneTail } from '../whatsapp/parse.js';
import { verifySignature } from '../whatsapp/signature.js';

// Inbound messages have no delivery lifecycle; 'delivered' = received by Vartalap.
const INBOUND_STATUS = 'delivered';

// API Gateway HTTP API (payload v2) → GET verification or POST callbacks from Meta.
export async function handler(event) {
  const method = event.requestContext?.http?.method;

  let params;
  try {
    params = await getParams(['WA_PHONE_NUMBER_ID', 'WA_APP_SECRET', 'WA_VERIFY_TOKEN']);
  } catch (err) {
    // Non-200 so Meta retries once the settings are fixed.
    log('error', 'params_unavailable', { error: err.message });
    return text(500, 'Internal error');
  }

  if (method === 'GET') return verifySubscription(event.queryStringParameters ?? {}, params);
  if (method === 'POST') return receive(event, params);
  return text(405, 'Method not allowed');
}

function verifySubscription(query, { WA_VERIFY_TOKEN }) {
  const ok =
    query['hub.mode'] === 'subscribe' && safeEqual(query['hub.verify_token'], WA_VERIFY_TOKEN);
  log(ok ? 'info' : 'warn', 'verify_subscription', { ok });
  return ok ? text(200, String(query['hub.challenge'] ?? '')) : text(403, 'Forbidden');
}

async function receive(event, { WA_PHONE_NUMBER_ID, WA_APP_SECRET }) {
  const rawBody = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
  if (!verifySignature(rawBody, event.headers?.['x-hub-signature-256'], WA_APP_SECRET)) {
    log('warn', 'bad_signature', { hasHeader: Boolean(event.headers?.['x-hub-signature-256']) });
    return text(401, 'Unauthorized');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    log('warn', 'bad_json');
    return text(400, 'Bad request');
  }

  const { messages, statuses, skipped } = parseWebhook(payload, WA_PHONE_NUMBER_ID);
  log('info', 'webhook_received', {
    messages: messages.length,
    statuses: statuses.length,
    skipped: skipped.length,
  });
  for (const item of skipped) log('warn', 'item_skipped', item);

  const counts = { stored: 0, duplicate: 0, applied: 0, notApplied: 0, unknown: 0, failed: 0 };

  // Sequential, in payload order, so messages for the same chat keep their order.
  for (const msg of messages) {
    try {
      const { duplicate } = await appendMessage({
        chatId: msg.chatId,
        message: {
          messageId: msg.waMessageId,
          waMessageId: msg.waMessageId,
          direction: 'in',
          senderType: 'client',
          senderId: null,
          type: 'text',
          text: msg.text,
          status: INBOUND_STATUS,
        },
        chat: { isClientMessage: true, clientName: msg.clientName },
      });
      counts[duplicate ? 'duplicate' : 'stored']++;
      log('info', duplicate ? 'message_duplicate' : 'message_stored', {
        waMessageId: msg.waMessageId,
        phoneTail: phoneTail(msg.chatId),
      });
    } catch (err) {
      counts.failed++;
      log('error', 'message_failed', {
        waMessageId: msg.waMessageId,
        phoneTail: phoneTail(msg.chatId),
        error: errorInfo(err),
      });
    }
  }

  for (const st of statuses) {
    try {
      const message = await getMessageByWaId(st.waMessageId);
      if (!message) {
        counts.unknown++;
        log('warn', 'status_unknown_message', { waMessageId: st.waMessageId });
        continue;
      }
      const { applied } = await updateStatus({
        messageId: message.messageId,
        status: st.status,
        errorCode: st.errorCode,
      });
      counts[applied ? 'applied' : 'notApplied']++;
      log('info', 'status_processed', {
        waMessageId: st.waMessageId,
        messageId: message.messageId,
        status: st.status,
        errorCode: st.errorCode,
        applied,
      });
    } catch (err) {
      counts.failed++;
      log('error', 'status_failed', { waMessageId: st.waMessageId, error: errorInfo(err) });
    }
  }

  log('info', 'webhook_processed', counts);
  return text(200, 'OK');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function text(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'text/plain' }, body };
}

// Error name/code/message only; AppError details may echo payload fields, so they are left out.
function errorInfo(err) {
  return { name: err?.name, code: err?.code, message: err?.message };
}

function log(level, msg, fields = {}) {
  const line = JSON.stringify({ level, msg, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
