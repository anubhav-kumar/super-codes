// HTTP helpers: JSON responses, errors, body readers, CORS, static files, request log.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { LIMITS } from '../lib/constants.js';

export class HttpError extends Error {
  constructor(status, code, message, headers) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function isHead(res) {
  return res.req?.method === 'HEAD';
}

export function sendJson(res, status, body, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    ...headers,
  });
  res.end(isHead(res) ? undefined : payload);
}

export function sendError(res, status, code, message, headers = {}) {
  sendJson(res, status, { error: { code, message } }, headers);
}

// Converts a thrown error into a response. Never leaks stack traces.
export function handleError(res, err) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (err instanceof HttpError) {
    sendError(res, err.status, err.code, err.message, err.headers);
    return;
  }
  console.error(`${new Date().toISOString()} ERROR ${res.req?.method} ${res.req?.url}`, err?.stack ?? err);
  sendError(res, 500, 'internal_error', 'internal server error');
}

const CLOSE = { Connection: 'close' };

export async function readJsonBody(req) {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!ct.startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  const max = LIMITS.MAX_JSON_BODY_BYTES;
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > max) {
    throw new HttpError(413, 'payload_too_large', `JSON body exceeds ${max} bytes`, CLOSE);
  }
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > max) {
        cleanup();
        req.resume();
        reject(new HttpError(413, 'payload_too_large', `JSON body exceeds ${max} bytes`, CLOSE));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks).toString('utf8')); };
    const onError = () => { cleanup(); reject(new HttpError(400, 'bad_request', 'request body aborted')); };
    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onError);
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onError);
  });
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'bad_request', 'malformed JSON body');
  }
}

export async function readMultipart(req, maxBytes) {
  const ct = String(req.headers['content-type'] ?? '');
  if (!ct.toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be multipart/form-data');
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, 'payload_too_large', `request body exceeds ${maxBytes} bytes`, CLOSE);
  }
  let size = 0;
  let overflow = false;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) {
        overflow = true;
        cb(new Error('body too large'));
        return;
      }
      cb(null, chunk);
    },
  });
  const onReqError = (err) => counter.destroy(err ?? new Error('request aborted'));
  req.on('error', onReqError);
  req.on('aborted', onReqError);
  req.pipe(counter);
  try {
    const request = new Request('http://local' + req.url, {
      method: 'POST',
      headers: { 'content-type': ct },
      body: Readable.toWeb(counter),
      duplex: 'half',
    });
    return await request.formData();
  } catch {
    if (overflow) {
      req.unpipe(counter);
      req.resume();
      throw new HttpError(413, 'payload_too_large', `request body exceeds ${maxBytes} bytes`, CLOSE);
    }
    throw new HttpError(400, 'bad_request', 'malformed multipart body');
  } finally {
    req.off('error', onReqError);
    req.off('aborted', onReqError);
  }
}

// --- CORS, Origin and Host checks (DESIGN §11.5) — fail closed ---
const CORS_RAW = process.env.CORS_ORIGIN ?? '';
const CORS_LIST = CORS_RAW.split(',').map((s) => s.trim()).filter(Boolean);
export const CORS_WILDCARD = CORS_LIST.includes('*');

const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost'];
const BIND_HOST = process.env.HOST ?? '127.0.0.1';
const ALLOWED_HOSTS = process.env.ALLOWED_HOSTS !== undefined
  ? process.env.ALLOWED_HOSTS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  : LOOPBACK_HOSTS.includes(BIND_HOST) ? ['localhost', '127.0.0.1', '[::1]'] : null;

// "Host: [::1]:3000" -> "[::1]", "Host: example:80" -> "example"
function hostnameOf(hostHeader) {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0];
}

// 421 when the Host header isn't allowed (blocks DNS rebinding). Entries may include a port.
export function checkHost(req) {
  if (!ALLOWED_HOSTS) return;
  const host = (req.headers.host ?? '').trim().toLowerCase();
  if (host && (ALLOWED_HOSTS.includes(host) || ALLOWED_HOSTS.includes(hostnameOf(host)))) return;
  throw new HttpError(421, 'misdirected_request', `host ${JSON.stringify(host)} is not allowed`);
}

function isAllowedOrigin(origin) {
  return CORS_WILDCARD || CORS_LIST.includes(origin);
}

function isSameOrigin(req, origin) {
  try {
    return new URL(origin).host === (req.headers.host ?? '').toLowerCase();
  } catch {
    return false;
  }
}

// 403 for browser POSTs from foreign origins (multipart POSTs skip preflight, so CORS alone isn't enough).
export function checkOrigin(req) {
  const origin = req.headers.origin;
  if (req.method !== 'POST' || !origin) return;
  if (isSameOrigin(req, origin) || isAllowedOrigin(origin)) return;
  throw new HttpError(403, 'forbidden_origin', `origin ${origin} is not allowed (set CORS_ORIGIN)`);
}

export function isCorsPath(pathname) {
  return pathname.startsWith('/api/') || pathname === '/api' || pathname.startsWith('/assets/') ||
    pathname === '/lib/constants.js';
}

// Sets CORS headers. Returns true if the request was a preflight that has been answered.
export function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = Boolean(origin) && !isSameOrigin(req, origin) && isAllowedOrigin(origin);
  if (CORS_LIST.length > 0) res.setHeader('Vary', 'Origin');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', CORS_WILDCARD ? '*' : origin);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition');
  }
  if (req.method === 'OPTIONS') {
    if (!allowed) {
      sendError(res, 403, 'forbidden_origin', `origin ${origin ?? '(none)'} is not allowed (set CORS_ORIGIN)`);
      return true;
    }
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID',
      'Access-Control-Max-Age': '600',
    });
    res.end();
    return true;
  }
  return false;
}

// --- Static files ---
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function notFoundText(res) {
  const body = 'Not found\n';
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(isHead(res) ? undefined : body);
}

// Scripts only from the UI's own origin; data (fetch/SSE/images) may come from a configured remote server.
const HTML_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' http: https: data: blob:",
  "connect-src 'self' http: https:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export async function serveStatic(res, absRoot, relPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(relPath);
  } catch {
    return notFoundText(res);
  }
  if (decoded.includes('\0')) return notFoundText(res);
  if (decoded === '/' || decoded === '') decoded = '/index.html';
  let target = path.resolve(absRoot, '.' + decoded);
  if (target !== absRoot && !target.startsWith(absRoot + path.sep)) return notFoundText(res);
  let st;
  try {
    st = await stat(target);
    if (st.isDirectory()) {
      target = path.join(target, 'index.html');
      st = await stat(target);
    }
  } catch {
    return notFoundText(res);
  }
  if (!st.isFile()) return notFoundText(res);
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    'Content-Type': STATIC_TYPES[ext] ?? 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...(ext === '.html' ? { 'Content-Security-Policy': HTML_CSP, 'Referrer-Policy': 'no-referrer' } : {}),
  });
  if (isHead(res)) return res.end();
  createReadStream(target).on('error', () => res.destroy()).pipe(res);
}

// --- Request log (never logs bodies) ---
export function attachRequestLog(req, res) {
  const start = Date.now();
  res.on('close', () => {
    const ms = Date.now() - start;
    const status = res.headersSent ? res.statusCode : '-';
    const suffix = res.isSse ? ` SSE closed after ${ms}ms` : ` ${ms}ms`;
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${status}${suffix}`);
  });
}
