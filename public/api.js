// HTTP wrappers. Every URL is built relative to the configured base so path prefixes work (DESIGN §5.2).
// Errors are always ApiError { status, code, message } (DESIGN §11.1); network failures use 'network_error'.

let base = null;

export function setBase(value) {
  base = value;
}

export function apiUrl(path, query) {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

export function chatPath(chatId, suffix = '') {
  return `api/chats/${encodeURIComponent(chatId)}${suffix}`;
}

export class ApiError extends Error {
  constructor({ status = 0, code, message }) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const NETWORK_MESSAGE = 'Network error: could not reach the server';

function errorFromBody(status, statusText, body) {
  const err = body && typeof body === 'object' ? body.error : null;
  const code = err && typeof err.code === 'string' ? err.code : status >= 500 ? 'internal_error' : 'http_error';
  const message = err && typeof err.message === 'string' && err.message
    ? err.message
    : statusText || `HTTP ${status}`;
  return new ApiError({ status, code, message });
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function request(method, path, { query, json, signal, timeoutMs = 30_000 } = {}) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);
  const init = { method, signal: AbortSignal.any(signals), cache: 'no-store' };
  if (json !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(json);
  }
  let res;
  let text;
  try {
    res = await fetch(apiUrl(path, query), init);
    text = await res.text();
  } catch (err) {
    if (signal?.aborted) throw new ApiError({ code: 'aborted', message: 'Request cancelled' });
    if (err?.name === 'TimeoutError') throw new ApiError({ code: 'network_error', message: 'Request timed out' });
    throw new ApiError({ code: 'network_error', message: NETWORK_MESSAGE });
  }
  const body = parseJson(text);
  if (!res.ok) throw errorFromBody(res.status, res.statusText, body);
  if (body === undefined || body === null || typeof body !== 'object') {
    throw new ApiError({ status: res.status, code: 'invalid_response', message: 'Server sent an unexpected (non-JSON) response' });
  }
  return body;
}

export const get = (path, opts) => request('GET', path, opts);
export const post = (path, json, opts) => request('POST', path, { ...opts, json });

// Multipart upload via XHR for upload progress (fetch has none). Returns { promise, abort }.
export function uploadMultipart(path, formData, { onProgress } = {}) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open('POST', apiUrl(path).href);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded, e.lengthComputable ? e.total : null);
    xhr.onload = () => {
      const body = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body === 'object') resolve(body);
      else if (xhr.status >= 200 && xhr.status < 300) {
        reject(new ApiError({ status: xhr.status, code: 'invalid_response', message: 'Server sent an unexpected (non-JSON) response' }));
      } else reject(errorFromBody(xhr.status, xhr.statusText, body));
    };
    xhr.onerror = () => reject(new ApiError({ code: 'network_error', message: NETWORK_MESSAGE }));
    xhr.ontimeout = () => reject(new ApiError({ code: 'network_error', message: 'Upload timed out' }));
    xhr.onabort = () => reject(new ApiError({ code: 'aborted', message: 'Upload cancelled' }));
    xhr.send(formData);
  });
  return { promise, abort: () => xhr.abort() };
}

// Cheap availability probe for non-image assets (DESIGN §9.3 HEAD). true/false, or null if unknown.
export async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
    if (res.ok) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}
