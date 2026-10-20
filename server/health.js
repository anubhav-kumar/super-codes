// Health endpoints (DESIGN §11.6).
import { readFileSync } from 'node:fs';
import { writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { LIMITS, PROTOCOL_VERSION } from '../lib/constants.js';
import { ulid } from '../lib/ulid.js';
import * as store from './store.js';
import { openStream, writeEvent } from './sse.js';
import { sendJson, readMultipart, HttpError } from './http-utils.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const STARTED_AT = new Date();

async function checkDataDir() {
  const dir = store.getDataDir();
  const probe = path.join(dir, '.health-' + ulid());
  const result = { ok: true, readable: true, writable: true };
  let firstError = null;
  try {
    await readdir(path.join(dir, 'chats'));
  } catch (err) {
    result.readable = false;
    firstError ??= err;
  }
  try {
    await writeFile(probe, 'ok');
    const back = await readFile(probe, 'utf8');
    if (back !== 'ok') throw new Error('probe file read back with wrong content');
    await rm(probe);
  } catch (err) {
    result.writable = false;
    firstError ??= err;
  } finally {
    await rm(probe, { force: true }).catch(() => {});
  }
  if (firstError) {
    result.ok = false;
    result.error = firstError.code ?? firstError.message ?? String(firstError);
  }
  return result;
}

export async function handleHealth(req, res) {
  const dataDir = await checkDataDir();
  const storeCheck = { ok: true, ...store.stats() };
  const ok = dataDir.ok && storeCheck.ok;
  const body = {
    ok,
    protocol: PROTOCOL_VERSION,
    version: VERSION,
    startedAt: STARTED_AT.toISOString(),
    uptimeSec: Math.floor((Date.now() - STARTED_AT.getTime()) / 1000),
    checks: { dataDir, store: storeCheck },
    limits: LIMITS,
  };
  sendJson(res, ok ? 200 : 503, body, { 'Cache-Control': 'no-store' });
}

export function handleHealthStream(req, res) {
  if (!openStream(req, res)) return;
  writeEvent(res, 'event: probe\ndata: {"n":1}\n\n');
  const timer = setTimeout(() => {
    writeEvent(res, 'event: probe\ndata: {"n":2}\n\n');
    res.end();
  }, 1000);
  req.on('close', () => clearTimeout(timer));
}

export async function handleHealthUpload(req, res) {
  const form = await readMultipart(req, LIMITS.MAX_ASSET_BYTES + LIMITS.MAX_JSON_BODY_BYTES);
  const files = form.getAll('files');
  if (files.length !== 1 || !(files[0] instanceof File)) {
    throw new HttpError(400, 'bad_request', 'expected exactly one "files" file part');
  }
  if (files[0].size > LIMITS.MAX_ASSET_BYTES) {
    throw new HttpError(413, 'payload_too_large', `file exceeds ${LIMITS.MAX_ASSET_BYTES} bytes`);
  }
  sendJson(res, 200, { ok: true, receivedBytes: files[0].size }, { 'Cache-Control': 'no-store' });
}
