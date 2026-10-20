#!/usr/bin/env node
// Agentic Chat CLI entry: dispatch, top-level error → stderr JSON + exit code (DESIGN §14).

import fs from 'node:fs';
import { CliError, EXIT } from '../cli/errors.js';

const COMMANDS = ['list', 'create', 'info', 'read', 'send', 'watch', 'asset', 'validate', 'config', 'health'];

function writeError(code, message) {
  process.stderr.write(JSON.stringify({ error: { code, message } }) + '\n');
}

function wantsHelp(args) {
  for (const a of args) {
    if (a === '--') return false;
    if (a === '--help' || a === '-h') return true;
  }
  return false;
}

async function main(argv) {
  const [first, ...rest] = argv;

  if (first === '--version' || first === '-v') {
    const { PROTOCOL_VERSION } = await import('../lib/constants.js');
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const { printLine } = await import('../cli/output.js');
    printLine({ version: pkg.version, protocol: PROTOCOL_VERSION });
    return EXIT.OK;
  }

  if (first === undefined) throw new CliError(EXIT.USAGE, 'usage', 'missing command (run "chat --help")');

  if (first === '--help' || first === '-h' || first === 'help') {
    const { USAGE } = await import('../cli/args.js');
    const target = first === 'help' && COMMANDS.includes(rest[0]) ? rest[0] : 'main';
    process.stdout.write(USAGE[target]);
    return EXIT.OK;
  }

  if (!COMMANDS.includes(first)) {
    throw new CliError(EXIT.USAGE, 'usage', `unknown command ${JSON.stringify(first)} (run "chat --help")`);
  }

  if (wantsHelp(rest)) {
    const { USAGE } = await import('../cli/args.js');
    process.stdout.write(USAGE[first]);
    return EXIT.OK;
  }

  const mod = await import(`../cli/commands/${first}.js`);
  return (await mod.run(rest)) ?? EXIT.OK;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (err) {
  if (err instanceof CliError) {
    writeError(err.code, err.message);
    process.exitCode = err.exitCode;
  } else {
    const missingLib = err && err.code === 'ERR_MODULE_NOT_FOUND' && /[\\/]lib[\\/]/.test(String(err.message));
    writeError('internal_error', missingLib ? `shared library missing: ${err.message}` : (err && err.message) || String(err));
    if (process.env.CHAT_DEBUG === '1' && err && err.stack) process.stderr.write(err.stack + '\n');
    process.exitCode = EXIT.NETWORK;
  }
}
