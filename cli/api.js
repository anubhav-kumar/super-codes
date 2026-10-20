// HTTP layer: relative URLs under the base (path prefixes work), error mapping, response validation.

import { MessageSchema, ChatSummarySchema, AssetSchema, formatZodError } from '../lib/schema.js';
import { ULID_RE } from '../lib/constants.js';
import { CliError, EXIT, HEALTH_HINT, invalidResponse } from './errors.js';

export function apiUrl(base, relPath, query) {
  const u = new URL(relPath, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
  }
  return u;
}

export const enc = encodeURIComponent;

function reasonOf(err) {
  if (!err) return 'unknown error';
  if (err.name === 'TimeoutError') return 'request timed out';
  const cause = err.cause;
  if (cause) {
    if (cause.code && cause.message) return cause.message.includes(cause.code) ? cause.message : `${cause.code}: ${cause.message}`;
    if (cause.code) return cause.code;
    if (cause.message) return cause.message;
    if (Array.isArray(cause.errors) && cause.errors[0]) return reasonOf({ cause: cause.errors[0] });
  }
  return err.message || String(err);
}

export function networkError(base, err) {
  return new CliError(EXIT.NETWORK, 'network_error', `cannot reach ${base}: ${reasonOf(err)} — ${HEALTH_HINT}`);
}

// Map a non-2xx response (body already parsed, or null if not JSON) to a CliError.
export function httpError(status, body, base) {
  const e = body && typeof body === 'object' && body.error && typeof body.error === 'object' ? body.error : null;
  const hasServerError = e && typeof e.code === 'string' && typeof e.message === 'string';
  let exit;
  if (status === 400 || status === 413 || status === 415) exit = EXIT.VALIDATION;
  else if (status === 404) exit = EXIT.NOT_FOUND;
  else if (status === 409) exit = EXIT.CONFLICT;
  else exit = EXIT.NETWORK;
  if (hasServerError) {
    const msg = exit === EXIT.NETWORK ? `${e.message} (HTTP ${status} from ${base}) — ${HEALTH_HINT}` : e.message;
    return new CliError(exit, e.code, msg);
  }
  if (exit === EXIT.NETWORK || !body) {
    return new CliError(EXIT.NETWORK, 'server_error', `unexpected HTTP ${status} from ${base}${body ? '' : ' (non-JSON body)'} — ${HEALTH_HINT}`);
  }
  return new CliError(exit, 'server_error', `unexpected HTTP ${status} from ${base}`);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Read a non-ok response's body and turn it into a CliError.
export async function errorFromResponse(res, base) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    // ignore: body unreadable
  }
  const body = parseJson(text);
  return httpError(res.status, body === undefined ? null : body, base);
}

// Low-level fetch with network error mapping. timeoutMs = 0 disables the timeout.
export async function rawFetch(base, relPath, { method = 'GET', query, headers, body, signal, timeoutMs = 30_000 } = {}) {
  const url = apiUrl(base, relPath, query);
  const signals = [];
  if (signal) signals.push(signal);
  if (timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs));
  const combined = signals.length === 0 ? undefined : signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  try {
    return await fetch(url, { method, headers, body, signal: combined, redirect: 'follow' });
  } catch (err) {
    if (signal && signal.aborted) throw err;
    throw networkError(base, err);
  }
}

// JSON request → parsed JSON body (2xx only); anything else becomes a CliError.
export async function request(base, method, relPath, { json, formData, query, signal, timeoutMs = 30_000 } = {}) {
  const headers = { Accept: 'application/json' };
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (formData !== undefined) {
    body = formData;
  }
  const res = await rawFetch(base, relPath, { method, query, headers, body, signal, timeoutMs });
  let text;
  try {
    text = await res.text();
  } catch (err) {
    if (signal && signal.aborted) throw err;
    throw networkError(base, err);
  }
  const parsed = parseJson(text);
  if (!res.ok) throw httpError(res.status, parsed === undefined ? null : parsed, base);
  if (parsed === undefined) {
    throw new CliError(EXIT.NETWORK, 'server_error', `non-JSON response (HTTP ${res.status}) from ${base} — ${HEALTH_HINT}`);
  }
  return parsed;
}

// ---- response validation ----

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function expectObject(body, what) {
  if (!isObject(body)) throw invalidResponse(`${what}: expected a JSON object`);
  return body;
}

export function checkMessage(obj, chatId) {
  const r = MessageSchema.safeParse(obj);
  if (!r.success) throw invalidResponse(`server sent an invalid message: ${formatZodError(r.error)}`);
  if (r.data.chatId !== chatId) throw invalidResponse(`server sent a message for chat "${r.data.chatId}", expected "${chatId}"`);
  return r.data;
}

export function checkSummary(obj, chatId) {
  const r = ChatSummarySchema.safeParse(obj);
  if (!r.success) throw invalidResponse(`server sent an invalid chat summary: ${formatZodError(r.error)}`);
  if (chatId !== undefined && r.data.id !== chatId) throw invalidResponse(`server sent chat "${r.data.id}", expected "${chatId}"`);
  return r.data;
}

export function checkAsset(obj) {
  const r = AssetSchema.safeParse(obj);
  if (!r.success) throw invalidResponse(`server sent an invalid asset: ${formatZodError(r.error)}`);
  return r.data;
}

export function checkUlid(value, what) {
  if (typeof value !== 'string' || !ULID_RE.test(value)) throw invalidResponse(`${what}: expected a ULID`);
  return value;
}
