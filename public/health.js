// Client-side connection diagnosis (DESIGN §11.6). Each check: { ok: true|false|null, ms, error? }.

export const CHECK_ORDER = ['reach', 'server', 'protocol', 'sse', 'upload'];

export const CHECK_LABELS = {
  reach: 'Server reachable',
  server: 'Server healthy',
  protocol: 'Protocol version',
  sse: 'Live updates (SSE)',
  upload: 'Uploads',
};

const SSE_HINT = 'Live updates are being buffered by something between you and the server (proxy/VPN)';
const UPLOAD_HINT = 'Uploads are blocked or size-limited between you and the server';
const UPLOAD_PROBE_BYTES = 64 * 1024;

const elapsed = (t0) => Math.round(performance.now() - t0);
const skipped = () => ({ ok: null, ms: 0 });

// GET api/health. Returns { reach, status?, body? }.
export async function reachCheck(base) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(new URL('api/health', base), { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    const error = err?.name === 'TimeoutError' ? 'No answer within 10 s — server unreachable' : 'server unreachable';
    return { reach: { ok: false, ms: elapsed(t0), error } };
  }
  let body;
  try {
    body = JSON.parse(await res.text());
  } catch {
    return { reach: { ok: false, ms: elapsed(t0), error: `Unexpected response from the server (HTTP ${res.status}, not JSON)` } };
  }
  return { reach: { ok: true, ms: elapsed(t0) }, status: res.status, body };
}

function describeServerFailure(status, body) {
  const problems = [];
  for (const [name, check] of Object.entries(body?.checks ?? {})) {
    if (!check || check.ok !== false) continue;
    if (name === 'dataDir' && check.writable === false) problems.push('Server disk not writable');
    else if (name === 'dataDir' && check.readable === false) problems.push('Server data directory not readable');
    else problems.push(`${name}: ${check.error ?? 'failed'}`);
  }
  if (problems.length) return problems.join('; ');
  return `Server reported a problem (HTTP ${status})`;
}

function probeSse(base) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let t1 = null;
    let done = false;
    let es;
    const finish = (ok, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      es?.close();
      resolve(error ? { ok, ms: elapsed(t0), error } : { ok, ms: elapsed(t0) });
    };
    const timer = setTimeout(() => finish(false, t1 === null ? `No probe event within 5 s. ${SSE_HINT}` : SSE_HINT), 5000);
    try {
      es = new EventSource(new URL('api/health/stream', base).href);
    } catch {
      finish(false, 'Could not open an SSE connection');
      return;
    }
    es.addEventListener('probe', (event) => {
      let n;
      try {
        n = JSON.parse(event.data).n;
      } catch {
        finish(false, 'Malformed probe event');
        return;
      }
      const now = performance.now();
      if (n === 1) {
        t1 = now;
        if (now - t0 > 2000) finish(false, SSE_HINT);
      } else if (n === 2) {
        if (t1 === null || now - t1 < 800) finish(false, SSE_HINT);
        else finish(true);
      }
    });
    es.addEventListener('error', () => {
      finish(false, t1 === null ? `SSE connection failed. ${SSE_HINT}` : SSE_HINT);
    });
  });
}

async function probeUpload(base) {
  const t0 = performance.now();
  const bytes = new Uint8Array(UPLOAD_PROBE_BYTES);
  crypto.getRandomValues(bytes);
  const form = new FormData();
  form.append('files', new Blob([bytes], { type: 'application/octet-stream' }), 'probe.bin');
  try {
    const res = await fetch(new URL('api/health/upload', base), {
      method: 'POST',
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    let body = null;
    try {
      body = JSON.parse(await res.text());
    } catch {
      // handled below
    }
    if (res.ok && body?.receivedBytes === UPLOAD_PROBE_BYTES) return { ok: true, ms: elapsed(t0) };
    const detail = res.ok
      ? `server received ${body?.receivedBytes ?? '?'} of ${UPLOAD_PROBE_BYTES} bytes`
      : `HTTP ${res.status}${body?.error?.message ? `: ${body.error.message}` : ''}`;
    return { ok: false, ms: elapsed(t0), error: `${UPLOAD_HINT} (${detail})` };
  } catch (err) {
    const detail = err?.name === 'TimeoutError' ? 'timed out' : 'request failed';
    return { ok: false, ms: elapsed(t0), error: `${UPLOAD_HINT} (${detail})` };
  }
}

// Full diagnosis.
// onUpdate(result) is called after each check so the panel can fill in progressively.
export async function runDiagnosis({ base, C, onUpdate }) {
  const result = {
    url: base,
    ok: false,
    server: null,
    checks: Object.fromEntries(CHECK_ORDER.map((name) => [name, { ok: null, ms: 0, pending: true }])),
    finishedAt: null,
  };
  const update = () => onUpdate?.(result);
  update();

  const reach = await reachCheck(base);
  result.checks.reach = reach.reach;
  if (!reach.reach.ok) {
    for (const name of ['server', 'protocol', 'sse', 'upload']) result.checks[name] = skipped();
    result.finishedAt = Date.now();
    update();
    return result;
  }
  result.server = reach.body;
  result.checks.server = reach.status === 200 && reach.body?.ok === true
    ? { ok: true, ms: reach.reach.ms }
    : { ok: false, ms: reach.reach.ms, error: describeServerFailure(reach.status, reach.body) };
  if (reach.body?.protocol === C.PROTOCOL_VERSION) result.checks.protocol = { ok: true, ms: 0 };
  else {
    result.checks.protocol = {
      ok: false,
      ms: 0,
      error: `Server and UI versions differ — reload (server ${reach.body?.protocol ?? '?'}, UI ${C.PROTOCOL_VERSION})`,
    };
  }
  update();

  result.checks.sse = await probeSse(base);
  update();
  result.checks.upload = await probeUpload(base);

  result.ok = CHECK_ORDER.every((name) => result.checks[name].ok !== false);
  result.finishedAt = Date.now();
  update();
  return result;
}

// Merge server-reported numeric limits over the UI's shared defaults (DESIGN §16).
export function mergeLimits(C, serverLimits) {
  const limits = { ...(C?.LIMITS ?? {}) };
  for (const [key, value] of Object.entries(serverLimits ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) limits[key] = value;
  }
  return limits;
}
