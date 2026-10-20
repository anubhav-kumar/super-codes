import { ZERO_ULID, extractMentions } from '../../lib/constants.js';
import { parseMessageLine } from '../../lib/schema.js';
import { parseCommand, expectPositionals, checkChatId, checkUlidArg, checkNameFlag, parseIntFlag } from '../args.js';
import { resolveUrl } from '../config.js';
import { request, rawFetch, enc, expectObject, checkSummary, checkMessage } from '../api.js';
import { readEvents, assertEventStream } from '../sse-client.js';
import { CliError, EXIT, HEALTH_HINT, invalidResponse } from '../errors.js';
import { printMessage } from '../output.js';

const CMD = 'watch';
const DEFAULT_RETRY_MS = 2000;
const MAX_BACKOFF_MS = 30_000;
const LIVENESS_MS = 45_000;
const MAX_TIMEOUT_S = 365 * 24 * 3600;

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  expectPositionals(CMD, positionals, 1, 1, ['<chatId>']);
  const chatId = checkChatId(positionals[0]);
  const since = values.since !== undefined ? checkUlidArg(values.since, '--since', CMD) : undefined;
  const count = values.count !== undefined ? parseIntFlag(values.count, '--count', 1, Number.MAX_SAFE_INTEGER, CMD) : undefined;
  const timeoutS = values.timeout !== undefined ? parseIntFlag(values.timeout, '--timeout', 1, MAX_TIMEOUT_S, CMD) : undefined;
  const ignore = new Set((values.ignore ?? []).map((n) => checkNameFlag(n, '--ignore', CMD)));
  const mention = values.mention !== undefined ? checkNameFlag(values.mention, '--mention', CMD) : undefined;
  const base = resolveUrl(values, CMD);

  // Overall stop controller: deadline, signals, --count reached, fatal error.
  const stop = new AbortController();
  let stopReason = null;
  const finish = (reason) => {
    if (stopReason === null) stopReason = reason;
    stop.abort();
  };
  const deadline = timeoutS !== undefined ? setTimeout(() => finish('timeout'), timeoutS * 1000) : null;
  const onSignal = () => finish('signal');
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  let printed = 0;
  try {
    // Fail fast on typos/outages, and pin an exact start cursor so reconnects never leave a gap.
    const info = expectObject(await request(base, 'GET', `api/chats/${enc(chatId)}`, { signal: stop.signal }), 'GET chat');
    const summary = checkSummary(info.chat, chatId);
    let lastId = since;
    if (lastId === undefined) {
      if (summary.messageCount === 0) {
        lastId = ZERO_ULID;
      } else {
        const page = expectObject(
          await request(base, 'GET', `api/chats/${enc(chatId)}/messages`, { query: { tail: 1 }, signal: stop.signal }),
          'GET messages',
        );
        if (!Array.isArray(page.messages)) throw invalidResponse('GET messages: "messages" must be an array');
        lastId = page.messages.length > 0 ? checkMessage(page.messages[page.messages.length - 1], chatId).id : ZERO_ULID;
      }
    }

    let retryMs = DEFAULT_RETRY_MS;
    let backoff = retryMs;
    let connectedOnce = false;
    const relPath = `api/chats/${enc(chatId)}/stream`;

    while (!stop.signal.aborted) {
      const conn = new AbortController();
      const abortConn = () => conn.abort();
      stop.signal.addEventListener('abort', abortConn, { once: true });
      let liveness = null;
      const bump = () => {
        clearTimeout(liveness);
        liveness = setTimeout(() => conn.abort(), LIVENESS_MS);
      };
      try {
        bump();
        // Header and ?since= carry the same cursor (the query survives proxies that drop headers).
        const headers = { Accept: 'text/event-stream', 'Cache-Control': 'no-cache', 'Last-Event-ID': lastId };
        const res = await rawFetch(base, relPath, {
          headers,
          query: { since: lastId },
          signal: conn.signal,
          timeoutMs: 0,
        });
        await assertEventStream(res, base);
        connectedOnce = true;
        backoff = retryMs;

        const events = readEvents(res, {
          onActivity: bump,
          onRetry: (ms) => {
            retryMs = ms;
            backoff = ms;
          },
        });
        for await (const ev of events) {
          if (ev.event !== 'message') continue;
          const parsed = parseMessageLine(ev.data);
          if (!parsed.ok) throw invalidResponse(`server sent an invalid message event (${parsed.code}): ${parsed.error}`);
          const msg = parsed.message;
          if (msg.chatId !== chatId) throw invalidResponse(`server sent a message for chat "${msg.chatId}", expected "${chatId}"`);
          if (ev.id !== msg.id) throw invalidResponse(`SSE id "${ev.id}" does not match message id ${msg.id}`);
          if (msg.id <= lastId) continue; // duplicate from replay
          lastId = msg.id;
          if (ignore.has(msg.author)) continue;
          if (mention !== undefined && !extractMentions(msg.text).includes(mention)) continue;
          printMessage(msg);
          printed++;
          if (count !== undefined && printed >= count) {
            finish('count');
            break;
          }
        }
      } catch (err) {
        if (stop.signal.aborted) break;
        if (err instanceof CliError) {
          // 404 is always fatal; invalid data is fatal; other errors only before the first successful connect.
          if (err.exitCode === EXIT.NOT_FOUND || err.code === 'invalid_response' || !connectedOnce) throw err;
        } else if (!connectedOnce) {
          const reason = conn.signal.aborted ? `no response within ${LIVENESS_MS / 1000}s` : err.message;
          throw new CliError(EXIT.NETWORK, 'network_error', `cannot reach ${base}: ${reason} — ${HEALTH_HINT}`);
        }
      } finally {
        clearTimeout(liveness);
        stop.signal.removeEventListener('abort', abortConn);
        conn.abort();
      }
      if (stop.signal.aborted) break;
      await sleep(backoff, stop.signal);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  } catch (err) {
    if (!(stop.signal.aborted && stopReason !== null)) throw err;
  } finally {
    clearTimeout(deadline);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  if (stopReason === 'timeout') {
    const want = count !== undefined ? ` before ${count} message(s) arrived` : '';
    throw new CliError(EXIT.TIMEOUT, 'timeout', `--timeout ${timeoutS}s elapsed${want} (printed ${printed})`);
  }
  return 0;
}
