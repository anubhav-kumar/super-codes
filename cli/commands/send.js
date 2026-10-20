import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  LIMITS,
  PROTOCOL_VERSION,
  FORBIDDEN_CTRL_RE,
  normalizeNewlines,
  findPlaceholders,
  resolvePlaceholders,
  sanitizeAssetName,
  extOf,
  mimeForExt,
} from '../../lib/constants.js';
import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl, resolveAuthor } from '../config.js';
import { request, enc, expectObject, checkMessage } from '../api.js';
import { CliError, EXIT, HEALTH_HINT, invalidResponse, validationError, fileNotFound, usageError } from '../errors.js';
import { printMessage } from '../output.js';

const CMD = 'send';

function decodeUtf8(buf, source) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
  } catch {
    throw validationError(`${source} is not valid UTF-8`);
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return decodeUtf8(Buffer.concat(chunks), 'stdin');
}

async function readTextFile(p) {
  let st;
  try {
    st = await fsp.stat(p);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') throw fileNotFound(p);
    throw validationError(`cannot read --text-file ${p}: ${err.message}`);
  }
  if (!st.isFile()) throw validationError(`--text-file ${p} is not a regular file`);
  return decodeUtf8(await fsp.readFile(p), `--text-file ${p}`);
}

function describeCtrl(text) {
  const m = FORBIDDEN_CTRL_RE.exec(text);
  if (!m) return null;
  const cp = m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  return `text contains forbidden control character U+${cp} at index ${m.index} (only tab and newline are allowed)`;
}

async function statAttachments(paths) {
  const out = [];
  for (const p of paths) {
    let st;
    try {
      st = await fsp.stat(p);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') throw fileNotFound(p);
      throw validationError(`cannot read --attach ${p}: ${err.message}`);
    }
    if (!st.isFile()) throw validationError(`--attach ${p} is not a regular file`);
    try {
      await fsp.access(p, fs.constants.R_OK);
    } catch {
      throw validationError(`--attach ${p} is not readable`);
    }
    const basename = path.basename(p);
    out.push({ path: p, basename, name: sanitizeAssetName(basename), size: st.size });
  }
  return out;
}

function checkLimits(text, files, limits) {
  if (text.length > limits.MAX_TEXT_CHARS) {
    throw validationError(`text is ${text.length} chars; the limit is ${limits.MAX_TEXT_CHARS}`);
  }
  if (files.length > limits.MAX_ASSETS_PER_MESSAGE) {
    throw validationError(`${files.length} attachments; the limit is ${limits.MAX_ASSETS_PER_MESSAGE} per message`);
  }
  for (const f of files) {
    if (f.size > limits.MAX_ASSET_BYTES) {
      throw validationError(`--attach ${f.path} is ${f.size} bytes; the limit is ${limits.MAX_ASSET_BYTES}`);
    }
  }
}

async function serverLimits(base) {
  const health = await request(base, 'GET', 'api/health', { timeoutMs: 10_000 });
  if (!health || typeof health !== 'object') throw invalidResponse('GET api/health: expected a JSON object');
  if (health.protocol !== PROTOCOL_VERSION) {
    throw new CliError(EXIT.NETWORK, 'server_error', `server protocol ${health.protocol}, client ${PROTOCOL_VERSION} — update the CLI (${HEALTH_HINT})`);
  }
  const limits = { ...LIMITS };
  if (health.limits && typeof health.limits === 'object') {
    for (const k of Object.keys(LIMITS)) {
      if (Number.isSafeInteger(health.limits[k]) && health.limits[k] >= 0) limits[k] = health.limits[k];
    }
  }
  return limits;
}

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  expectPositionals(CMD, positionals, 1, 2, ['<chatId>', '<text>']);
  const chatId = checkChatId(positionals[0]);
  const attachPaths = values.attach ?? [];

  const sources = (positionals.length > 1 ? 1 : 0) + (values['text-file'] !== undefined ? 1 : 0);
  if (sources > 1) throw usageError('give the text exactly once: a <text> argument, "-" (stdin) or --text-file', CMD);
  if (sources === 0 && attachPaths.length === 0) {
    throw usageError('missing text: give <text>, "-" (stdin) or --text-file (text may be omitted only with --attach)', CMD);
  }

  const base = resolveUrl(values, CMD);
  const author = resolveAuthor(values);
  if (author === null) throw usageError('no author: pass --as <name>, set CHAT_AUTHOR, or run "chat config set author <name>"', CMD);

  let rawText = '';
  if (positionals.length > 1) rawText = positionals[1] === '-' ? await readStdin() : positionals[1];
  else if (values['text-file'] !== undefined) rawText = await readTextFile(values['text-file']);
  const text = normalizeNewlines(rawText);

  const ctrl = describeCtrl(text);
  if (ctrl) throw validationError(ctrl);
  const files = await statAttachments(attachPaths);
  if (text.trim() === '' && files.length === 0) throw validationError('text must not be empty or whitespace-only without attachments');
  const maxPlaceholder = Math.max(0, ...findPlaceholders(text));
  if (maxPlaceholder > files.length) {
    throw validationError(`text references asset:$${maxPlaceholder} but only ${files.length} file(s) are attached`);
  }
  checkLimits(text, files, LIMITS);

  let body;
  const relPath = `api/chats/${enc(chatId)}/messages`;
  if (files.length === 0) {
    body = await request(base, 'POST', relPath, { json: { author, text } });
  } else {
    // Check reachability/protocol and use the server's real limits before uploading.
    checkLimits(text, files, await serverLimits(base));
    const form = new FormData();
    form.append('author', author);
    form.append('text', text);
    for (const f of files) {
      const blob = await fs.openAsBlob(f.path, { type: mimeForExt(extOf(f.basename)) ?? 'application/octet-stream' });
      form.append('files', blob, f.basename);
    }
    body = await request(base, 'POST', relPath, { formData: form, timeoutMs: 0 });
  }

  expectObject(body, 'POST messages');
  const msg = checkMessage(body.message, chatId);
  if (msg.author !== author) throw invalidResponse(`stored message author "${msg.author}" does not match "${author}"`);
  if (msg.assets.length !== files.length) {
    throw invalidResponse(`stored message has ${msg.assets.length} assets, ${files.length} were attached`);
  }
  files.forEach((f, i) => {
    if (msg.assets[i].name !== f.name) {
      throw invalidResponse(`stored asset ${i + 1} is named "${msg.assets[i].name}", expected "${f.name}"`);
    }
    if (msg.assets[i].size !== f.size) {
      throw invalidResponse(`stored asset ${i + 1} has ${msg.assets[i].size} bytes, expected ${f.size}`);
    }
  });
  const resolved = resolvePlaceholders(text, msg.assets.map((a) => a.id));
  if (!resolved.ok || resolved.text !== msg.text) throw invalidResponse('stored message text does not match the text sent');

  printMessage(msg);
  return 0;
}
