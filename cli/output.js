// stdout is JSONL only; stderr carries one JSON error line (DESIGN §14).

import { serializeMessage, serializeChatSummary } from '../lib/schema.js';

// `chat ... | head -1` closes the pipe: stop quietly with exit 0.
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') {
    process.exitCode = 0;
    process.exit(0);
  }
  throw err;
});

export function printRaw(line) {
  process.stdout.write(line + '\n');
}

export function printLine(obj) {
  printRaw(JSON.stringify(obj));
}

export function printMessage(msg) {
  printRaw(serializeMessage(msg));
}

export function printSummary(c) {
  printRaw(serializeChatSummary(c));
}

export function printError(code, message) {
  process.stderr.write(JSON.stringify({ error: { code, message } }) + '\n');
}
