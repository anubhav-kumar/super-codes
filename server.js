// Agentic Chat HTTP server entry point (DESIGN §11).
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { LIMITS, ULID_RE, extOf, mimeForExt, INLINE_IMAGE_EXTS } from './lib/constants.js';
import { ChatIdSchema, formatZodError } from './lib/schema.js';
import { validateChatFile } from './lib/validate.js';
import * as store from './server/store.js';
import * as sse from './server/sse.js';
import { createRouter } from './server/router.js';
import { handleHealth, handleHealthStream, handleHealthUpload } from './server/health.js';
import {
  HttpError, sendJson, sendError, handleError, readJsonBody, readMultipart, applyCors, isCorsPath,
  checkHost, checkOrigin, CORS_WILDCARD,
  serveStatic, attachRequestLog,
} from './server/http-utils.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR ?? './data');
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = path.resolve(ROOT, 'public');
const LIB_DIR = path.resolve(ROOT, 'lib');

const notFound = (what) => new HttpError(404, 'not_found', `${what} not found`);

function requireChat(chatId) {
  if (!store.hasChat(chatId)) throw notFound(`chat "${chatId}"`);
}

function compareSummaries(a, b) {
  if (a.lastMessageAt !== b.lastMessageAt) {
    if (a.lastMessageAt === null) return 1;
    if (b.lastMessageAt === null) return -1;
    return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Parses query params, rejecting unknown and duplicated keys (400 bad_request).
function parseQuery(url, allowed) {
  const out = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.includes(key)) throw new HttpError(400, 'bad_request', `unknown query parameter "${key}"`);
    if (key in out) throw new HttpError(400, 'bad_request', `duplicate query parameter "${key}"`);
    out[key] = value;
  }
  return out;
}

function checkUlidParam(name, value) {
  if (value !== undefined && !ULID_RE.test(value)) {
    throw new HttpError(400, 'bad_request', `${name}: must match ${ULID_RE.source}`);
  }
}

const CreateChatSchema = z.strictObject({ id: ChatIdSchema });

const router = createRouter();

router.add('GET', '/api/health', handleHealth);
router.add('GET', '/api/health/stream', handleHealthStream);
router.add('POST', '/api/health/upload', handleHealthUpload);

router.add('GET', '/api/chats', (req, res) => {
  const chats = store.listChatIds().map((id) => store.getSummary(id)).sort(compareSummaries);
  sendJson(res, 200, { chats });
});

router.add('POST', '/api/chats', async (req, res) => {
  const body = await readJsonBody(req);
  const r = CreateChatSchema.safeParse(body);
  if (!r.success) {
    const unknownKeys = r.error.issues.some((i) => i.code === 'unrecognized_keys');
    throw new HttpError(400, unknownKeys ? 'bad_request' : 'validation_failed', formatZodError(r.error));
  }
  const chat = await store.createChat(r.data.id);
  sse.broadcastChat(chat);
  sendJson(res, 201, { chat });
});

router.add('GET', '/api/chats/:chatId', (req, res, { chatId }) => {
  requireChat(chatId);
  sendJson(res, 200, { chat: store.getSummary(chatId) });
});

router.add('GET', '/api/chats/:chatId/messages', (req, res, { chatId }, url) => {
  const q = parseQuery(url, ['since', 'before', 'tail']);
  checkUlidParam('since', q.since);
  checkUlidParam('before', q.before);
  let tail;
  if (q.tail !== undefined) {
    if (!/^[1-9][0-9]*$/.test(q.tail) || Number(q.tail) > LIMITS.MAX_TAIL) {
      throw new HttpError(400, 'bad_request', `tail: must be an integer 1-${LIMITS.MAX_TAIL}`);
    }
    tail = Number(q.tail);
  }
  requireChat(chatId);
  const r = store.queryMessages(chatId, { since: q.since, before: q.before, tail });
  sendJson(res, 200, { messages: r.messages, hasMore: r.hasMore });
});

async function readSendBody(req) {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  if (ct.startsWith('application/json')) {
    const body = await readJsonBody(req);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'bad_request', 'body must be a JSON object');
    }
    const extra = Object.keys(body).filter((k) => k !== 'author' && k !== 'text');
    if (extra.length) throw new HttpError(400, 'bad_request', `unknown field(s): ${extra.join(', ')}`);
    return { author: body.author, text: body.text, files: [] };
  }
  if (ct.startsWith('multipart/form-data')) {
    const max = LIMITS.MAX_ASSETS_PER_MESSAGE * LIMITS.MAX_ASSET_BYTES + LIMITS.MAX_JSON_BODY_BYTES;
    const form = await readMultipart(req, max);
    let author;
    let text;
    const files = [];
    for (const [key, value] of form) {
      if (key === 'author') {
        if (author !== undefined) throw new HttpError(400, 'bad_request', 'field "author" given more than once');
        if (typeof value !== 'string') throw new HttpError(400, 'bad_request', 'field "author" must be a string');
        author = value;
      } else if (key === 'text') {
        if (text !== undefined) throw new HttpError(400, 'bad_request', 'field "text" given more than once');
        if (typeof value !== 'string') throw new HttpError(400, 'bad_request', 'field "text" must be a string');
        text = value;
      } else if (key === 'files') {
        if (!(value instanceof File)) throw new HttpError(400, 'bad_request', 'field "files" must be a file part');
        files.push(value);
      } else {
        throw new HttpError(400, 'bad_request', `unknown field "${key}"`);
      }
    }
    if (author === undefined) throw new HttpError(400, 'bad_request', 'field "author" is required');
    return { author, text: text ?? '', files };
  }
  throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json or multipart/form-data');
}

router.add('POST', '/api/chats/:chatId/messages', async (req, res, { chatId }) => {
  requireChat(chatId);
  const input = await readSendBody(req);
  const message = await store.appendMessage(chatId, input);
  sse.broadcastMessage(message);
  sse.broadcastChat(store.getSummary(chatId));
  sendJson(res, 201, { message });
});

router.add('GET', '/api/chats/:chatId/assets/:assetId', async (req, res, { chatId, assetId }) => {
  requireChat(chatId);
  const r = await store.getAsset(chatId, assetId);
  if (!r) throw notFound(`asset ${assetId}`);
  sendJson(res, 200, r);
});

router.add('GET', '/api/chats/:chatId/validate', async (req, res, { chatId }) => {
  requireChat(chatId);
  try {
    const report = await validateChatFile({
      chatId,
      chatPath: store.chatFilePath(chatId),
      assetsDir: store.chatAssetsPath(chatId),
    });
    sendJson(res, 200, report);
  } catch (err) {
    if (err?.code === 'ENOENT') throw notFound(`chat "${chatId}"`);
    throw err;
  }
});

router.add('GET', '/api/chats/:chatId/stream', (req, res, { chatId }, url) => {
  requireChat(chatId);
  let resumeId = null;
  const lastEventId = req.headers['last-event-id'];
  if (typeof lastEventId === 'string' && ULID_RE.test(lastEventId.trim())) {
    resumeId = lastEventId.trim();
  } else if (url.searchParams.has('since')) {
    const since = url.searchParams.get('since');
    checkUlidParam('since', since);
    resumeId = since;
  }
  if (!sse.openStream(req, res)) return;
  sse.subscribeChat(chatId, res, resumeId);
});

router.add('GET', '/api/stream', (req, res) => {
  if (!sse.openStream(req, res)) return;
  sse.subscribeGlobal(res);
});

function contentDisposition(ext, name) {
  const type = INLINE_IMAGE_EXTS.includes(ext) ? 'inline' : 'attachment';
  const ascii = name.replace(/[^\x20-\x7E]|["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

router.add('GET', '/assets/:chatId/:file', async (req, res, { chatId, file }) => {
  const assetId = file.slice(0, 26);
  const entry = store.hasChat(chatId) ? await store.getAsset(chatId, assetId) : null;
  if (!entry || entry.asset.file !== file) throw notFound(`asset ${file}`);
  const abs = store.assetPath(chatId, file);
  let st;
  try {
    st = await stat(abs);
    if (!st.isFile()) throw new Error('not a file');
  } catch {
    throw new HttpError(404, 'asset_missing', `asset ${assetId} file is not available`);
  }
  const ext = extOf(file);
  res.writeHead(200, {
    'Content-Type': mimeForExt(ext) ?? 'application/octet-stream',
    'Content-Length': st.size,
    'Content-Disposition': contentDisposition(ext, entry.asset.name),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(abs).on('error', () => res.destroy()).pipe(res);
});

async function onRequest(req, res) {
  attachRequestLog(req, res);
  try {
    let url;
    try {
      url = new URL('http://local' + (req.url.startsWith('/') ? req.url : '/' + req.url));
    } catch {
      throw notFound('route');
    }
    const pathname = url.pathname;
    const isApi = pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/assets/');

    checkHost(req);
    if (isCorsPath(pathname) && applyCors(req, res)) return; // preflight answered
    checkOrigin(req);

    if (pathname === '/lib/constants.js' && (req.method === 'GET' || req.method === 'HEAD')) {
      return await serveStatic(res, LIB_DIR, '/constants.js');
    }

    const m = router.match(req.method, pathname);
    if (m?.handler) return await m.handler(req, res, m.params, url);
    if (m?.allow) {
      return sendError(res, 405, 'method_not_allowed', `method ${req.method} not allowed`, { Allow: m.allow.join(', ') });
    }
    if (isApi) throw notFound('route');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found\n');
    }
    return await serveStatic(res, PUBLIC_DIR, pathname);
  } catch (err) {
    handleError(res, err);
  }
}

async function main() {
  await store.init(DATA_DIR);
  const server = http.createServer((req, res) => {
    onRequest(req, res).catch((err) => handleError(res, err));
  });
  server.requestTimeout = 10 * 60 * 1000; // allow slow large uploads

  server.on('error', (err) => {
    console.error(`${new Date().toISOString()} ERROR server: ${err.code ?? err.message}`);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(`${new Date().toISOString()} listening on http://${HOST}:${PORT} (data: ${DATA_DIR})`);
    if (!['127.0.0.1', '::1', 'localhost'].includes(HOST)) {
      console.warn(`${new Date().toISOString()} WARN no authentication — anyone who can reach this server can read and post`);
    }
    if (CORS_WILDCARD) {
      console.warn(`${new Date().toISOString()} WARN CORS_ORIGIN=* — any website a user visits can read chats from this server`);
    }
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    console.log(`${new Date().toISOString()} ${signal} received, shutting down`);
    server.close();
    sse.closeAll();
    server.closeIdleConnections?.();
    try {
      await store.drain();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`${new Date().toISOString()} ERROR startup failed:`, err?.stack ?? err);
  process.exit(1);
});
