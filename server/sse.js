// SSE hub: open streams, per-chat and global subscribers, broadcast, heartbeat (DESIGN §12).
import { serializeMessage, serializeChatSummary } from '../lib/schema.js';
import * as store from './store.js';

const streams = new Set(); // every open SSE response
const chatSubs = new Map(); // chatId -> Set<res>
const globalSubs = new Set();

function drop(res) {
  streams.delete(res);
  globalSubs.delete(res);
  for (const [chatId, set] of chatSubs) {
    set.delete(res);
    if (set.size === 0) chatSubs.delete(chatId);
  }
}

function write(res, chunk) {
  if (res.destroyed || res.writableEnded) {
    drop(res);
    return false;
  }
  try {
    res.write(chunk); // returning false is fine: Node buffers
    return true;
  } catch {
    drop(res);
    return false;
  }
}

// Returns false if no stream was opened (HEAD request).
export function openStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (req.method === 'HEAD') {
    res.end();
    return false;
  }
  res.isSse = true;
  res.flushHeaders();
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  streams.add(res);
  req.on('close', () => drop(res));
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} SSE open`);
  write(res, 'retry: 2000\n\n');
  return true;
}

export function writeEvent(res, chunk) {
  return write(res, chunk);
}

function messageEvent(msg) {
  return `id: ${msg.id}\nevent: message\ndata: ${serializeMessage(msg)}\n\n`;
}

// Replay + registration are synchronous so no message can fall into a gap.
export function subscribeChat(chatId, res, resumeId) {
  if (!streams.has(res)) return;
  if (resumeId) {
    const r = store.queryMessages(chatId, { since: resumeId });
    for (const msg of r?.messages ?? []) {
      if (!write(res, messageEvent(msg))) return;
    }
  }
  let set = chatSubs.get(chatId);
  if (!set) chatSubs.set(chatId, (set = new Set()));
  set.add(res);
}

export function subscribeGlobal(res) {
  if (streams.has(res)) globalSubs.add(res);
}

export function broadcastMessage(msg) {
  const set = chatSubs.get(msg.chatId);
  if (!set) return;
  const chunk = messageEvent(msg);
  for (const res of [...set]) write(res, chunk);
}

export function broadcastChat(summary) {
  const chunk = `event: chat\ndata: ${serializeChatSummary(summary)}\n\n`;
  for (const res of [...globalSubs]) write(res, chunk);
}

const heartbeat = setInterval(() => {
  for (const res of [...streams]) write(res, ': ping\n\n');
}, 15_000);
heartbeat.unref();

export function closeAll() {
  clearInterval(heartbeat);
  for (const res of [...streams]) {
    try {
      res.end();
    } catch {
      // ignore
    }
    drop(res);
  }
}
