// Minimal WhatsApp Cloud API client: text messages, plus media messages (F2).
import { getParams } from '../lib/params.js';

const GRAPH_BASE_URL = 'https://graph.facebook.com';

// Well below the 30 s sender Lambda timeout, so a hung request still leaves time to record it.
const REQUEST_TIMEOUT_MS = 10_000;

// Meta error codes that mean "try again later", whatever the HTTP status (often 400).
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const RETRYABLE_META_CODES = new Set([
  '2', // temporary downtime or overload
  '4', // app API call rate limit
  '80007', // WhatsApp Business Account rate limit
  '130429', // Cloud API throughput limit
  '131000', // unknown error, "try again"
  '131016', // service temporarily unavailable
  '131056', // too many messages to the same recipient (pair rate limit)
  '133004', // server temporarily unavailable
]);
// Not retryable, on purpose: '131053' (media upload error, e.g. MIME/extension mismatch or an
// unsupported video profile) is final; the code is stored on the message and shown in the UI.

// retryable: SQS should try again. status: HTTP status (null for network errors).
// code: Meta's error.code as a string, or 'NETWORK' / 'TIMEOUT' / 'BAD_RESPONSE'.
export class WhatsAppSendError extends Error {
  constructor(message, { retryable, status = null, code }) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.retryable = retryable;
    this.status = status;
    this.code = code;
  }
}

export function isRetryable(status, code) {
  if (code != null && RETRYABLE_META_CODES.has(String(code))) return true;
  return status === 429 || status >= 500;
}

// to: E.164 ('+65...'). Cloud API takes the number as digits only, like the wa_id it reports.
// → { waMessageId }. Throws WhatsAppSendError.
export async function sendText({ to, body }) {
  return postMessage(to, { type: 'text', text: { preview_url: false, body } });
}

// F2: kind is image | video | audio | document; waMediaId comes from uploadMedia().
// Audio takes no caption; documents carry their filename. → { waMessageId }.
export async function sendMedia({ to, kind, waMediaId, caption, filename }) {
  const object = { id: waMediaId };
  if (caption && kind !== 'audio') object.caption = caption;
  if (filename && kind === 'document') object.filename = filename;
  return postMessage(to, { type: kind, [kind]: object });
}

// Graph settings shared by every Cloud API call (also used by whatsapp/media.js).
export async function graphSettings() {
  const { WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN } = await getParams([
    'WA_PHONE_NUMBER_ID',
    'WA_ACCESS_TOKEN',
  ]);
  const version = process.env.WA_GRAPH_VERSION;
  if (!version) throw new Error('Missing env var WA_GRAPH_VERSION');
  return {
    phoneNumberId: WA_PHONE_NUMBER_ID,
    token: WA_ACCESS_TOKEN,
    baseUrl: `${GRAPH_BASE_URL}/${version}`,
  };
}

async function postMessage(to, message) {
  const { phoneNumberId, token, baseUrl } = await graphSettings();

  let res;
  try {
    res = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/^\+/, ''),
        ...message,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw new WhatsAppSendError(
      timedOut ? 'Cloud API request timed out' : 'Cloud API unreachable',
      {
        retryable: true,
        code: timedOut ? 'TIMEOUT' : 'NETWORK',
      },
    );
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) throw graphError(res, payload);

  const waMessageId = payload?.messages?.[0]?.id;
  if (!waMessageId) {
    // Accepted (2xx) but unreadable: retrying could send it twice, so treat it as final.
    throw new WhatsAppSendError('Cloud API response has no message ID', {
      retryable: false,
      status: res.status,
      code: 'BAD_RESPONSE',
    });
  }
  return { waMessageId };
}

// Non-2xx Graph response → WhatsAppSendError (retryable per isRetryable).
export function graphError(res, payload) {
  const error = payload?.error ?? {};
  const code = error.code != null ? String(error.code) : `HTTP_${res.status}`;
  // Meta's message describes the error, not the request; it holds no message text or token.
  return new WhatsAppSendError(error.message ?? `Cloud API returned ${res.status}`, {
    retryable: isRetryable(res.status, error.code),
    status: res.status,
    code,
  });
}
