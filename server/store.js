// File store: load chats from disk, in-memory cache, append via per-chat write queue (DESIGN §7).
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, appendFile, rename, rm, stat, truncate } from 'node:fs/promises';
import path from 'node:path';
import {
  CHAT_ID_RE, LIMITS, MIME_RE, normalizeNewlines, sanitizeAssetName, extOf, mimeForExt, resolvePlaceholders,
} from '../lib/constants.js';
import { ulid, ulidTime } from '../lib/ulid.js';
import {
  MessageSchema, SendInputSchema, ParticipantsFileSchema, parseMessageLine, serializeMessage, serializeParticipant, formatZodError,
} from '../lib/schema.js';
import { HttpError } from './http-utils.js';

let dataDir = null;
let chatsDir = null;
let assetsRoot = null;
let archiveRoot = null;

const chats = new Map(); // chatId -> { messages, assetIndex, lastId, participants: Map<name, joinedAt> }
const queues = new Map(); // chatId -> Promise (never rejects)
const appearing = new Set(); // chat files seen once by syncWithDisk, loaded on the next scan
const loadStats = { invalidLines: 0, missingAssets: 0, partialRecovered: 0 };

const warn = (msg) => console.warn(`${new Date().toISOString()} WARN ${msg}`);
const info = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

export function getDataDir() {
  return dataDir;
}

function chatPath(chatId) {
  return path.join(chatsDir, `${chatId}.jsonl`);
}

function participantsPath(chatId) {
  return path.join(chatsDir, `${chatId}.participants.json`);
}

function chatAssetsDir(chatId) {
  return path.join(assetsRoot, chatId);
}

function archiveDir(chatId) {
  return path.join(archiveRoot, chatId);
}

export function archivedError(chatId) {
  return new HttpError(410, 'archived',
    `chat "${chatId}" is archived (data/archive/${chatId}); move its files back into data/chats and data/assets to reactivate it`);
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
  archiveRoot = path.join(dataDir, 'archive');
  await mkdir(chatsDir, { recursive: true });
  await mkdir(assetsRoot, { recursive: true });
  await mkdir(archiveRoot, { recursive: true });

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

  for (const id of await chatFileIds()) {
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

  const chat = { messages: [], assetIndex: new Map(), lastId: null, participants: new Map() };
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

  await loadParticipants(chatId, chat);

  loadStats.invalidLines += invalid;
  loadStats.missingAssets += missing;
  chats.set(chatId, chat);
  return { messages: chat.messages.length, invalid, missingAssets: missing };
}

// Participants live in a sidecar file. A chat from before participants existed has none: everyone who
// has posted is seeded as a participant (joinedAt = their first message) so existing agents keep working.
async function loadParticipants(chatId, chat) {
  const file = participantsPath(chatId);
  let raw = null;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (raw !== null) {
    let parsed = null;
    try {
      parsed = ParticipantsFileSchema.safeParse(JSON.parse(raw));
    } catch (err) {
      parsed = { success: false, error: { issues: [{ message: err.message }] } };
    }
    if (parsed.success) {
      for (const p of parsed.data.participants) chat.participants.set(p.name, p.joinedAt);
      return;
    }
    const aside = `${file}.invalid-${Date.now()}`;
    await rename(file, aside);
    warn(`chat=${chatId} invalid participants file (${formatZodError(parsed.error)}) moved to ${path.basename(aside)}; re-seeding from authors`);
  }
  for (const m of chat.messages) {
    if (!chat.participants.has(m.author)) chat.participants.set(m.author, m.ts);
  }
  if (chat.participants.size > 0) {
    await writeParticipants(chatId, chat.participants);
    info(`chat=${chatId} seeded ${chat.participants.size} participant(s) from message authors`);
  }
}

async function writeParticipants(chatId, participants) {
  const file = participantsPath(chatId);
  const list = [...participants].map(([name, joinedAt]) => serializeParticipant({ name, joinedAt }));
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `{"participants":[${list.join(',')}]}\n`);
  await rename(tmp, file);
}

async function chatFileIds() {
  return (await readdir(chatsDir))
    .filter((n) => n.endsWith('.jsonl'))
    .map((n) => n.slice(0, -'.jsonl'.length))
    .filter((id) => CHAT_ID_RE.test(id))
    .sort();
}

// Picks up manual moves in data/chats while running (DESIGN §7.6): a chat file that appeared (e.g. an
// archived chat moved back) is loaded once it has been present for two scans, so a multi-file move can
// finish first; a chat whose file is gone is unloaded. → { added: [chatId], removed: [chatId] }
export async function syncWithDisk() {
  const onDisk = new Set(await chatFileIds());
  const added = [];
  const removed = [];
  for (const id of [...chats.keys()]) {
    // Re-check: the chat may have been created after readdir ran.
    if (!onDisk.has(id) && !existsSync(chatPath(id))) {
      chats.delete(id);
      removed.push(id);
      info(`chat=${id} file is gone from data/chats; unloaded`);
    }
  }
  for (const id of appearing) if (!onDisk.has(id)) appearing.delete(id);
  for (const id of onDisk) {
    if (chats.has(id)) continue;
    if (!appearing.has(id)) {
      appearing.add(id);
      continue;
    }
    appearing.delete(id);
    try {
      const r = await loadChat(id);
      added.push(id);
      info(`loaded chat=${id} (appeared on disk) messages=${r.messages} invalid=${r.invalid} missingAssets=${r.missingAssets}`);
    } catch (err) {
      console.error(`${new Date().toISOString()} ERROR failed to load chat=${id}: ${err.code ?? err.message}`);
    }
  }
  return { added, removed };
}

export function isArchived(chatId) {
  return existsSync(path.join(archiveDir(chatId), `${chatId}.jsonl`));
}

// Moves a chat out of data/chats into data/archive/<chatId>/ (DESIGN §7.6):
//   <chatId>.jsonl, <chatId>.participants.json (+ any .partial-/.invalid- leftovers), assets/, archive.json
// The chat is unloaded; it comes back only when someone moves the files back by hand.
export async function archiveChat(chatId, by) {
  if (!chats.has(chatId)) throw new HttpError(404, 'not_found', `chat "${chatId}" not found`);
  if (!isParticipant(chatId, by)) {
    throw new HttpError(403, 'not_participant', `"${by}" is not a participant of chat "${chatId}"; only participants can archive it`);
  }
  return enqueue(chatId, async () => {
    if (!chats.has(chatId)) throw archivedError(chatId);
    const dest = archiveDir(chatId);
    let existing = [];
    try {
      existing = await readdir(dest);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (existing.length > 0) {
      throw new HttpError(409, 'conflict', `data/archive/${chatId} already exists and is not empty; move or remove it first`);
    }
    await mkdir(dest, { recursive: true });
    const meta = { chatId, archivedAt: new Date().toISOString(), archivedBy: by };
    await writeFile(path.join(dest, 'archive.json'), JSON.stringify(meta) + '\n');

    // The .jsonl goes last: until it moves, the chat still exists on disk and a crash leaves it active.
    const files = (await readdir(chatsDir)).filter((n) => n.startsWith(`${chatId}.`) && n !== `${chatId}.jsonl`);
    for (const name of files) await rename(path.join(chatsDir, name), path.join(dest, name));
    try {
      await rename(chatAssetsDir(chatId), path.join(dest, 'assets'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await rename(chatPath(chatId), path.join(dest, `${chatId}.jsonl`));
    chats.delete(chatId);
    info(`chat=${chatId} archived by ${by} to data/archive/${chatId}`);
    return meta;
  });
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
  return {
    id: chatId,
    messageCount: chat.messages.length,
    lastMessageAt: last ? last.ts : null,
    participants: [...chat.participants.keys()],
  };
}

export function listParticipants(chatId) {
  const chat = chats.get(chatId);
  if (!chat) return null;
  return [...chat.participants].map(([name, joinedAt]) => ({ name, joinedAt }));
}

export function isParticipant(chatId, name) {
  return chats.get(chatId)?.participants.has(name) ?? false;
}

// → { participant, joined } where joined is false if `name` was already a participant.
export async function joinChat(chatId, name) {
  if (!chats.has(chatId)) throw new HttpError(404, 'not_found', `chat "${chatId}" not found`);
  return enqueue(chatId, async () => {
    const chat = chats.get(chatId);
    if (!chat) throw archivedError(chatId);
    if (chat.participants.has(name)) return { participant: { name, joinedAt: chat.participants.get(name) }, joined: false };
    const joinedAt = new Date().toISOString();
    const next = new Map(chat.participants).set(name, joinedAt);
    await writeParticipants(chatId, next);
    chat.participants = next;
    return { participant: { name, joinedAt }, joined: true };
  });
}

export async function leaveChat(chatId, name) {
  if (!chats.has(chatId)) throw new HttpError(404, 'not_found', `chat "${chatId}" not found`);
  return enqueue(chatId, async () => {
    const chat = chats.get(chatId);
    if (!chat) throw archivedError(chatId);
    if (!chat.participants.has(name)) {
      throw new HttpError(404, 'not_participant', `"${name}" is not a participant of chat "${chatId}"`);
    }
    const participant = { name, joinedAt: chat.participants.get(name) };
    const next = new Map(chat.participants);
    next.delete(name);
    await writeParticipants(chatId, next);
    chat.participants = next;
    return participant;
  });
}

export async function createChat(chatId) {
  if (isArchived(chatId)) {
    throw new HttpError(409, 'conflict', `chat "${chatId}" is archived; pick another id or restore it by moving its files back`);
  }
  try {
    await writeFile(chatPath(chatId), '', { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') throw new HttpError(409, 'conflict', `chat "${chatId}" already exists`);
    throw err;
  }
  chats.set(chatId, { messages: [], assetIndex: new Map(), lastId: null, participants: new Map() });
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
  if (!isParticipant(chatId, input.data.author)) {
    throw new HttpError(403, 'not_participant',
      `"${input.data.author}" is not a participant of chat "${chatId}" — join the chat before sending`);
  }
  const normalized = normalizeNewlines(input.data.text);
  if (normalized.trim() === '' && files.length === 0) {
    throw new HttpError(400, 'validation_failed', 'text: must not be empty when there are no files');
  }

  return enqueue(chatId, async () => {
    const chat = chats.get(chatId);
    if (!chat) throw archivedError(chatId); // archived while this send was queued
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
