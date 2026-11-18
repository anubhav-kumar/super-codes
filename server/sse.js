// SSE hub: open streams, per-chat and global subscribers, broadcast, heartbeat (DESIGN §12).
import { serializeMessage, serializeChatSummary, serializeParticipant } from '../lib/schema.js';
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

// No id: field, so a participants event never moves a client's Last-Event-ID resume point.
export function broadcastParticipants(chatId, participants) {
  const set = chatSubs.get(chatId);
  if (!set) return;
  const data = `{"chatId":${JSON.stringify(chatId)},"participants":[${participants.map(serializeParticipant).join(',')}]}`;
  const chunk = `event: participants\ndata: ${data}\n\n`;
  for (const res of [...set]) write(res, chunk);
}

export function broadcastChat(summary) {
  const chunk = `event: chat\ndata: ${serializeChatSummary(summary)}\n\n`;
  for (const res of [...globalSubs]) write(res, chunk);
}

// A chat was archived or its file disappeared: tell the list (global) and the chat's own streams, then
// end the chat's streams. Clients that reconnect get 410 archived / 404.
export function broadcastRemoved(chatId, reason) {
  const data = JSON.stringify({ id: chatId, reason });
  for (const res of [...globalSubs]) write(res, `event: chat-removed\ndata: ${data}\n\n`);
  const set = chatSubs.get(chatId);
  if (!set) return;
  for (const res of [...set]) {
    write(res, `event: removed\ndata: ${data}\n\n`);
    try {
      res.end();
    } catch {
      // ignore
    }
    drop(res);
  }
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
