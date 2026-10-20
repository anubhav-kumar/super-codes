// Minimal WHATWG-style EventSource parser over a fetch Response (DESIGN §12).

import { errorFromResponse } from './api.js';
import { CliError, EXIT, HEALTH_HINT } from './errors.js';

// Throws a CliError unless the response is a 200 text/event-stream.
export async function assertEventStream(response, base) {
  if (response.status !== 200) throw await errorFromResponse(response, base);
  const type = response.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('text/event-stream')) {
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    throw new CliError(EXIT.NETWORK, 'server_error', `expected text/event-stream from ${base}, got "${type || 'no content-type'}" — ${HEALTH_HINT}`);
  }
}

// Yields { id, event, data } for each dispatched event. `id` is the last event ID buffer ('' if none).
export async function* readEvents(response, { onRetry, onActivity } = {}) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let skipLeadingLf = false; // a '\r' ended the previous chunk; a following '\n' belongs to it
  let dataLines = [];
  let eventType = '';
  let lastId = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (onActivity) onActivity();
      if (!value) continue;
      buf += value;
      if (skipLeadingLf && buf.length > 0) {
        if (buf[0] === '\n') buf = buf.slice(1);
        skipLeadingLf = false;
      }
      let start = 0;
      while (start < buf.length) {
        let i = start;
        while (i < buf.length && buf[i] !== '\n' && buf[i] !== '\r') i++;
        if (i >= buf.length) break; // incomplete line
        const line = buf.slice(start, i);
        if (buf[i] === '\r') {
          if (i + 1 < buf.length) {
            start = buf[i + 1] === '\n' ? i + 2 : i + 1;
          } else {
            start = i + 1;
            skipLeadingLf = true;
          }
        } else {
          start = i + 1;
        }

        if (line === '') {
          if (dataLines.length > 0) {
            const ev = { id: lastId, event: eventType || 'message', data: dataLines.join('\n') };
            dataLines = [];
            eventType = '';
            yield ev;
          } else {
            eventType = '';
          }
          continue;
        }
        if (line[0] === ':') continue; // comment / heartbeat

        const colon = line.indexOf(':');
        let field;
        let val;
        if (colon === -1) {
          field = line;
          val = '';
        } else {
          field = line.slice(0, colon);
          val = line.slice(colon + 1);
          if (val[0] === ' ') val = val.slice(1);
        }
        if (field === 'event') eventType = val;
        else if (field === 'data') dataLines.push(val);
        else if (field === 'id') {
          if (!val.includes('\u0000')) lastId = val;
        } else if (field === 'retry') {
          if (/^[0-9]+$/.test(val) && onRetry) onRetry(Number(val));
        }
      }
      buf = buf.slice(start);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}
