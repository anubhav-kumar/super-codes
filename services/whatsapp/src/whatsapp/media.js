// F2: WhatsApp Cloud API media endpoints.
// https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media
// Never log the URLs returned here: they are Meta download links (bearer-protected, 5 min).
import { WhatsAppSendError, graphError, graphSettings } from './client.js';

const RESOLVE_TIMEOUT_MS = 10_000;
// Uploads of up to 16 MB (decision D3); well inside the sender's timeout.
const UPLOAD_TIMEOUT_MS = 40_000;

// The media ID no longer exists (webhook IDs last 7 days) or was deleted: final.
export class MediaGoneError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaGoneError';
  }
}

// waMediaId → { url, mimeType, size, sha256 }. A fresh URL each call (it expires in 5 minutes),
// so retries always re-resolve rather than reuse the webhook's `url` field.
export async function resolveMedia(waMediaId) {
  const { token, baseUrl, phoneNumberId } = await graphSettings();
  const url = `${baseUrl}/${encodeURIComponent(waMediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId)}`;
  const res = await request(url, { headers: { Authorization: `Bearer ${token}` } }, RESOLVE_TIMEOUT_MS);
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const error = payload?.error ?? {};
    // 404, or Graph's "object does not exist" (code 100, subcode 33): the ID has expired.
    if (res.status === 404 || (String(error.code) === '100' && String(error.error_subcode) === '33')) {
      throw new MediaGoneError('Media ID no longer exists');
    }
    throw graphError(res, payload);
  }
  if (!payload?.url) {
    throw new WhatsAppSendError('Media lookup has no URL', {
      retryable: true,
      status: res.status,
      code: 'BAD_RESPONSE',
    });
  }
  return {
    url: payload.url,
    mimeType: payload.mime_type ?? null,
    size: Number.isFinite(Number(payload.file_size)) ? Number(payload.file_size) : null,
    sha256: payload.sha256 ?? null,
  };
}

// Starts the binary download. → fetch Response with a readable body. The caller streams it.
// A 404 here means the 5-minute URL expired: retryable (the retry re-resolves).
export async function downloadMedia(url, { timeoutMs }) {
  const { token } = await graphSettings();
  const res = await request(url, { headers: { Authorization: `Bearer ${token}` } }, timeoutMs);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new WhatsAppSendError(`Media download returned ${res.status}`, {
      retryable: true,
      status: res.status,
      code: `HTTP_${res.status}`,
    });
  }
  return res;
}

// Uploads a file for sending. → waMediaId (valid 30 days). Throws WhatsAppSendError.
export async function uploadMedia({ data, mimeType, filename }) {
  const { token, baseUrl, phoneNumberId } = await graphSettings();
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([data], { type: mimeType }), filename || 'file');

  const res = await request(
    `${baseUrl}/${phoneNumberId}/media`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
    UPLOAD_TIMEOUT_MS,
  );
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw graphError(res, payload);
  if (!payload?.id) {
    throw new WhatsAppSendError('Media upload response has no ID', {
      retryable: true,
      status: res.status,
      code: 'BAD_RESPONSE',
    });
  }
  return payload.id;
}

async function request(url, init, timeoutMs) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw new WhatsAppSendError(timedOut ? 'Cloud API request timed out' : 'Cloud API unreachable', {
      retryable: true,
      code: timedOut ? 'TIMEOUT' : 'NETWORK',
    });
  }
}
