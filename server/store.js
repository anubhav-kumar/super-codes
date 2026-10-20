// File store: load chats from disk, in-memory cache, append via per-chat write queue (DESIGN §7).
import { mkdir, readdir, readFile, writeFile, appendFile, rename, rm, stat, truncate } from 'node:fs/promises';
import path from 'node:path';
import {
  CHAT_ID_RE, LIMITS, MIME_RE, normalizeNewlines, sanitizeAssetName, extOf, mimeForExt, resolvePlaceholders,
} from '../lib/constants.js';
import { ulid, ulidTime } from '../lib/ulid.js';
import { MessageSchema, SendInputSchema, parseMessageLine, serializeMessage, formatZodError } from '../lib/schema.js';
import { HttpError } from './http-utils.js';

let dataDir = null;
let chatsDir = null;
let assetsRoot = null;

const chats = new Map(); // chatId -> { messages, assetIndex, lastId }
const queues = new Map(); // chatId -> Promise (never rejects)
const loadStats = { invalidLines: 0, missingAssets: 0, partialRecovered: 0 };

const warn = (msg) => console.warn(`${new Date().toISOString()} WARN ${msg}`);
const info = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

export function getDataDir() {
  return dataDir;
}

function chatPath(chatId) {
  return path.join(chatsDir, `${chatId}.jsonl`);
}

function chatAssetsDir(chatId) {
  return path.join(assetsRoot, chatId);
}

export function chatFilePath(chatId) {
  return chatPath(chatId);
}

export function chatAssetsPath(chatId) {
  return chatAssetsDir(chatId);
}

export async function init(dir) {
  dataDir = path.resolve(dir);
  chatsDir = path.join(dataDir, 'chats');
  assetsRoot = path.join(dataDir, 'assets');
  await mkdir(chatsDir, { recursive: true });
  await mkdir(assetsRoot, { recursive: true });

  // Remove temp files left by an interrupted upload.
  let tmpCount = 0;
  for (const entry of await readdir(assetsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(assetsRoot, entry.name);
    let names = [];
    try {
      names = await readdir(dirPath);
    } catch (err) {
      warn(`cannot read ${dirPath}: ${err.code ?? err.message}`);
      continue;
    }
    for (const name of names) {
      if (!name.startsWith('.tmp-')) continue;
      try {
        await rm(path.join(dirPath, name), { force: true });
        tmpCount++;
      } catch (err) {
        warn(`cannot remove ${path.join(dirPath, name)}: ${err.code ?? err.message}`);
      }
    }
  }
  info(`removed ${tmpCount} leftover temp file${tmpCount === 1 ? '' : 's'}`);

  const ids = (await readdir(chatsDir))
    .filter((n) => n.endsWith('.jsonl'))
    .map((n) => n.slice(0, -'.jsonl'.length))
    .filter((id) => CHAT_ID_RE.test(id))
    .sort();
  for (const id of ids) {
    try {
      const r = await loadChat(id);
      info(`loaded chat=${id} messages=${r.messages} invalid=${r.invalid} missingAssets=${r.missingAssets}`);
    } catch (err) {
      console.error(`${new Date().toISOString()} ERROR failed to load chat=${id}: ${err.code ?? err.message}`);
    }
  }
  const s = stats();
  const fmt = (n) => n.toLocaleString('en-US');
  info(`loaded ${fmt(s.chats)} chat${s.chats === 1 ? '' : 's'}, ${fmt(s.messages)} messages, ` +
    `${fmt(s.invalidLines)} invalid lines skipped, ${fmt(s.missingAssets)} missing asset${s.missingAssets === 1 ? '' : 's'}, ` +
    `${fmt(s.partialRecovered)} partial lines recovered`);
}

export async function loadChat(chatId) {
  const file = chatPath(chatId);
  let buf = await readFile(file);

  if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) {
    const lastNl = buf.lastIndexOf(0x0a);
    const keep = lastNl + 1; // 0 if no newline at all
    const partialPath = `${file}.partial-${Date.now()}`;
    await writeFile(partialPath, buf.subarray(keep));
    await truncate(file, keep);
    buf = buf.subarray(0, keep);
    loadStats.partialRecovered++;
    warn(`chat=${chatId} trailing partial line moved to ${path.basename(partialPath)}, file truncated to ${keep} bytes`);
  }

  const text = new TextDecoder('utf-8').decode(buf);
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  const chat = { messages: [], assetIndex: new Map(), lastId: null };
  let invalid = 0;
  lines.forEach((line, i) => {
    const n = i + 1;
    const r = parseMessageLine(line);
    let problem = null;
    if (!r.ok) problem = `${r.code}: ${r.error}`;
    else if (r.message.chatId !== chatId) problem = `chat_id_mismatch: chatId "${r.message.chatId}"`;
    else if (chat.lastId !== null && r.message.id <= chat.lastId) problem = `id_order: ${r.message.id} <= ${chat.lastId}`;
    if (problem) {
      invalid++;
      warn(`chat=${chatId} line=${n} ${problem}`);
      return;
    }
    chat.messages.push(r.message);
    chat.lastId = r.message.id;
    for (const asset of r.message.assets) {
      chat.assetIndex.set(asset.id, { asset, messageId: r.message.id });
    }
  });

  let missing = 0;
  for (const { asset } of chat.assetIndex.values()) {
    try {
      await stat(path.join(chatAssetsDir(chatId), asset.file));
    } catch {
      missing++;
      warn(`chat=${chatId} asset=${asset.id} file missing`);
    }
  }

  loadStats.invalidLines += invalid;
  loadStats.missingAssets += missing;
  chats.set(chatId, chat);
  return { messages: chat.messages.length, invalid, missingAssets: missing };
}

export function listChatIds() {
  return [...chats.keys()];
}

export function hasChat(chatId) {
  return chats.has(chatId);
}

export function getSummary(chatId) {
  const chat = chats.get(chatId);
  if (!chat) return null;
  const last = chat.messages[chat.messages.length - 1];
  return { id: chatId, messageCount: chat.messages.length, lastMessageAt: last ? last.ts : null };
}

export async function createChat(chatId) {
  try {
    await writeFile(chatPath(chatId), '', { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') throw new HttpError(409, 'conflict', `chat "${chatId}" already exists`);
    throw err;
  }
  chats.set(chatId, { messages: [], assetIndex: new Map(), lastId: null });
  return getSummary(chatId);
}

export function queryMessages(chatId, { since, before, tail } = {}) {
  const chat = chats.get(chatId);
  if (!chat) return null;
  let list = chat.messages;
  if (since) list = list.filter((m) => m.id > since);
  if (before) list = list.filter((m) => m.id < before);
  let hasMore = false;
  if (tail && list.length > tail) {
    hasMore = true;
    list = list.slice(list.length - tail);
  }
  return { messages: list, hasMore };
}

export async function getAsset(chatId, assetId) {
  const entry = chats.get(chatId)?.assetIndex.get(assetId);
  if (!entry) return null;
  let available = false;
  try {
    available = (await stat(assetPath(chatId, entry.asset.file))).isFile();
  } catch {
    available = false;
  }
  return { asset: entry.asset, messageId: entry.messageId, available };
}

// Only call after validating chatId/file with their regexes.
export function assetPath(chatId, file) {
  return path.join(chatAssetsDir(chatId), file);
}

function enqueue(chatId, fn) {
  const prev = queues.get(chatId) ?? Promise.resolve();
  const run = prev.then(fn);
  queues.set(chatId, run.catch(() => {}));
  return run;
}

function pickMime(declared, ext) {
  const t = String(declared ?? '').split(';')[0].trim().toLowerCase();
  if (t && MIME_RE.test(t) && t !== 'application/octet-stream') return t;
  return mimeForExt(ext) ?? 'application/octet-stream';
}

export async function appendMessage(chatId, { author, text, files = [] }) {
  if (!chats.has(chatId)) throw new HttpError(404, 'not_found', `chat "${chatId}" not found`);
  const input = SendInputSchema.safeParse({ author, text });
  if (!input.success) throw new HttpError(400, 'validation_failed', formatZodError(input.error));
  if (files.length > LIMITS.MAX_ASSETS_PER_MESSAGE) {
    throw new HttpError(413, 'payload_too_large', `at most ${LIMITS.MAX_ASSETS_PER_MESSAGE} files per message`);
  }
  for (const f of files) {
    if (f.size > LIMITS.MAX_ASSET_BYTES) {
      throw new HttpError(413, 'payload_too_large', `file "${sanitizeAssetName(f.name)}" exceeds ${LIMITS.MAX_ASSET_BYTES} bytes`);
    }
  }
  const normalized = normalizeNewlines(input.data.text);
  if (normalized.trim() === '' && files.length === 0) {
    throw new HttpError(400, 'validation_failed', 'text: must not be empty when there are no files');
  }

  return enqueue(chatId, async () => {
    const chat = chats.get(chatId);
    const written = [];
    try {
      const assets = [];
      if (files.length > 0) await mkdir(chatAssetsDir(chatId), { recursive: true });
      let lastAssetId = null;
      for (const f of files) {
        const assetId = ulid({ after: lastAssetId ?? chat.lastId ?? undefined });
        lastAssetId = assetId;
        const name = sanitizeAssetName(f.name);
        const ext = extOf(name);
        const fileName = assetId + ext;
        const tmp = path.join(chatAssetsDir(chatId), `.tmp-${assetId}`);
        const final = path.join(chatAssetsDir(chatId), fileName);
        const bytes = Buffer.from(await f.arrayBuffer());
        written.push(tmp);
        await writeFile(tmp, bytes);
        written.push(final);
        await rename(tmp, final);
        assets.push({ id: assetId, file: fileName, name, mime: pickMime(f.type, ext), size: bytes.length });
      }

      const id = ulid({ after: lastAssetId ?? chat.lastId ?? undefined });
      const ts = new Date(ulidTime(id)).toISOString();
      const resolved = resolvePlaceholders(normalized, assets.map((a) => a.id));
      if (!resolved.ok) throw new HttpError(400, 'validation_failed', resolved.error);

      const candidate = { id, chatId, ts, author: input.data.author, text: resolved.text, assets };
      const parsed = MessageSchema.safeParse(candidate);
      if (!parsed.success) throw new HttpError(400, 'validation_failed', formatZodError(parsed.error));
      const msg = parsed.data;

      // Remember the size so a failed (possibly partial) append can be rolled back.
      const sizeBefore = (await stat(chatPath(chatId))).size;
      try {
        await appendFile(chatPath(chatId), serializeMessage(msg) + '\n');
      } catch (err) {
        await truncate(chatPath(chatId), sizeBefore).catch(() => {});
        throw err;
      }

      chat.messages.push(msg);
      chat.lastId = msg.id;
      for (const asset of msg.assets) chat.assetIndex.set(asset.id, { asset, messageId: msg.id });
      return msg;
    } catch (err) {
      await Promise.all(written.map((p) => rm(p, { force: true }).catch(() => {})));
      throw err;
    }
  });
}

export function stats() {
  let messages = 0;
  for (const c of chats.values()) messages += c.messages.length;
  return { chats: chats.size, messages, ...loadStats };
}

export async function drain() {
  await Promise.all([...queues.values()]);
}
