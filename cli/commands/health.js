import { randomBytes } from 'node:crypto';
import { LIMITS, PROTOCOL_VERSION } from '../../lib/constants.js';
import { parseCommand, expectPositionals, parseIntFlag } from '../args.js';
import { resolveUrl } from '../config.js';
import { rawFetch } from '../api.js';
import { readEvents, assertEventStream } from '../sse-client.js';
import { CliError, HEALTH_HINT } from '../errors.js';
import { printLine } from '../output.js';

const CMD = 'health';
const DEFAULT_UPLOAD_BYTES = 65_536;
const BUFFERED = "responses are buffered between you and the server (proxy?) — live updates won't work";
const UPLOAD_BLOCKED = 'upload blocked or size-limited between you and the server';

const skipped = () => ({ ok: null, ms: 0 });

function errText(err) {
  if (err instanceof CliError) return err.message.replace(` — ${HEALTH_HINT}`, '');
  if (err && err.name === 'TimeoutError') return 'timed out';
  const c = err && err.cause;
  if (c && (c.code || c.message)) return c.code && c.message && !c.message.includes(c.code) ? `${c.code}: ${c.message}` : c.message || c.code;
  return (err && err.message) || String(err);
}

async function timed(fn) {
  const t0 = performance.now();
  try {
    const extra = await fn();
    return { ok: true, ms: Math.round(performance.now() - t0), ...(extra || {}) };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: errText(err) };
  }
}

async function checkSse(base) {
  const t0 = performance.now();
  const res = await rawFetch(base, 'api/health/stream', { headers: { Accept: 'text/event-stream' }, timeoutMs: 6_000 });
  await assertEventStream(res, base);
  const times = {};
  try {
    for await (const ev of readEvents(res)) {
      if (ev.event !== 'probe') continue;
      let n;
      try {
        n = JSON.parse(ev.data).n;
      } catch {
        throw new Error(`malformed probe event: ${ev.data}`);
      }
      if ((n === 1 || n === 2) && times[n] === undefined) times[n] = performance.now() - t0;
      if (times[2] !== undefined) break;
    }
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`${BUFFERED} (probe events did not arrive within 6 s)`);
    }
    throw err;
  }
  if (times[1] === undefined || times[2] === undefined) throw new Error('probe stream ended before both probe events arrived');
  if (times[1] > 2000 || times[2] - times[1] < 800) throw new Error(BUFFERED);
}

async function checkUpload(base, bytes) {
  const form = new FormData();
  form.append('files', new Blob([randomBytes(bytes)], { type: 'application/octet-stream' }), 'probe.bin');
  let res;
  try {
    res = await rawFetch(base, 'api/health/upload', { method: 'POST', body: form, timeoutMs: 120_000 });
  } catch (err) {
    throw new Error(`${UPLOAD_BLOCKED} (${errText(err)})`);
  }
  if (res.status === 413) throw new Error(`${UPLOAD_BLOCKED} (HTTP 413)`);
  let body;
  try {
    body = JSON.parse(await res.text());
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`HTTP ${res.status}, non-JSON response`);
    throw new Error(`${UPLOAD_BLOCKED} (${errText(err)})`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}${body?.error?.message ? `: ${body.error.message}` : ''}`);
  if (body?.receivedBytes !== bytes) throw new Error(`server received ${body?.receivedBytes} bytes, sent ${bytes}`);
}

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  expectPositionals(CMD, positionals, 0, 0, []);
  let uploadBytes = DEFAULT_UPLOAD_BYTES;
  if (values['upload-bytes'] !== undefined) {
    uploadBytes = parseIntFlag(values['upload-bytes'], '--upload-bytes', 1, LIMITS.MAX_ASSET_BYTES, CMD);
  }
  const base = resolveUrl(values, CMD);

  const checks = { reach: skipped(), server: skipped(), protocol: skipped(), sse: skipped(), upload: skipped() };
  let server = null;
  let status = 0;

  checks.reach = await timed(async () => {
    const res = await rawFetch(base, 'api/health', { headers: { Accept: 'application/json' }, timeoutMs: 10_000 });
    status = res.status;
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${res.status}, response is not JSON`);
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error(`HTTP ${res.status}, response is not a JSON object`);
    server = body;
  });

  if (checks.reach.ok) {
    checks.server = await timed(async () => {
      if (status === 200 && server.ok === true) return;
      const failing = server.checks && typeof server.checks === 'object'
        ? Object.entries(server.checks)
          .filter(([, c]) => c && c.ok === false)
          .map(([name, c]) => `${name}: ${c.error ?? 'failed'}`)
        : [];
      throw new Error(failing.length ? failing.join('; ') : `HTTP ${status}, ok=${JSON.stringify(server.ok)}`);
    });
    checks.protocol = await timed(async () => {
      if (server.protocol !== PROTOCOL_VERSION) {
        throw new Error(`server protocol ${server.protocol}, client ${PROTOCOL_VERSION} — update the CLI`);
      }
    });
    checks.sse = await timed(() => checkSse(base));
    checks.upload = await timed(async () => {
      const max = Number.isSafeInteger(server.limits?.MAX_ASSET_BYTES) ? server.limits.MAX_ASSET_BYTES : LIMITS.MAX_ASSET_BYTES;
      if (uploadBytes > max) throw new Error(`--upload-bytes ${uploadBytes} exceeds the server's MAX_ASSET_BYTES ${max}`);
      await checkUpload(base, uploadBytes);
    });
  }

  const ok = Object.values(checks).every((c) => c.ok === true);
  printLine({ url: base, ok, server, checks });
  return ok ? 0 : 2;
}
