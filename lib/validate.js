// Chat-file validator (DESIGN §7.1, §13.4). Node only. Read-only.
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseMessageLine } from './schema.js';

export async function validateChatFile({ chatId, chatPath, assetsDir }) {
  const file = path.basename(chatPath);
  const problems = [];
  const add = (line, level, code, message) => problems.push({ line, level, code, message });

  const buf = await readFile(chatPath); // ENOENT propagates (err.code === 'ENOENT')

  let bytes = buf;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    add(null, 'error', 'bom', 'file starts with a UTF-8 byte order mark');
    bytes = buf.subarray(3);
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    add(null, 'error', 'invalid_utf8', 'file is not valid UTF-8');
    await checkPartials(chatPath, chatId, add);
    return finish(file, 0, 0, problems);
  }

  if (text.length > 0 && !text.endsWith('\n')) {
    add(null, 'error', 'no_final_newline', 'file does not end with \\n');
  }

  const segments = text.split('\n');
  if (segments[segments.length - 1] === '') segments.pop();

  const seen = new Set();
  let prevId = null;
  let valid = 0;
  const validMessages = [];

  segments.forEach((line, idx) => {
    const n = idx + 1;
    if (line.includes('\r')) add(n, 'error', 'crlf', 'line contains \\r (CRLF line endings?)');
    if (line === '') {
      add(n, 'error', 'blank_line', 'blank line');
      return;
    }
    const r = parseMessageLine(line);
    if (!r.ok) {
      add(n, 'error', r.code, r.error);
      return;
    }
    const m = r.message;
    if (m.chatId !== chatId) {
      add(n, 'error', 'chat_id_mismatch', `chatId "${m.chatId}" does not match file "${chatId}"`);
      return;
    }
    if (seen.has(m.id)) {
      add(n, 'error', 'duplicate_id', `duplicate message id ${m.id}`);
      return;
    }
    seen.add(m.id);
    if (prevId !== null && m.id <= prevId) {
      add(n, 'error', 'id_order', `id ${m.id} is not greater than previous id ${prevId}`);
      return;
    }
    prevId = m.id;
    valid++;
    validMessages.push({ n, m });
  });

  for (const { n, m } of validMessages) {
    for (const a of m.assets) {
      try {
        const st = await stat(path.join(assetsDir, a.file));
        if (st.size !== a.size) {
          add(n, 'warning', 'asset_size_mismatch',
            `asset ${a.id} (${a.file}) is ${st.size} bytes on disk, message says ${a.size}`);
        }
      } catch {
        add(n, 'warning', 'asset_missing', `asset ${a.id} (${a.file}) file not found`);
      }
    }
  }

  await checkPartials(chatPath, chatId, add);
  return finish(file, segments.length, valid, problems);
}

async function checkPartials(chatPath, chatId, add) {
  const prefix = `${chatId}.jsonl.partial-`;
  let names = [];
  try {
    names = await readdir(path.dirname(chatPath));
  } catch {
    return;
  }
  for (const name of names.sort()) {
    if (name.startsWith(prefix)) {
      add(null, 'warning', 'partial_file_present', `recovered partial line file present: ${name}`);
    }
  }
}

function finish(file, lines, valid, problems) {
  const key = (p) => (p.line === null ? 0 : p.line);
  problems.sort((a, b) => key(a) - key(b)); // stable: keeps insertion order within a line
  return { file, lines, valid, problems };
}
