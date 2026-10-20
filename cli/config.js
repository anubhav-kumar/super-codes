// CLI configuration: config file + URL/author resolution (DESIGN §5.2).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AUTHOR_RE } from '../lib/constants.js';
import { CliError, EXIT, usageError, validationError } from './errors.js';

export const DEFAULT_URL = 'http://localhost:3000';
export const CONFIG_KEYS = ['url', 'author'];

export function configPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'agentic-chat', 'config.json');
}

// Returns a normalized base URL (always ending with '/') or an error string.
export function checkBaseUrl(value) {
  if (typeof value !== 'string' || value === '') return 'must be a non-empty string';
  let u;
  try {
    u = new URL(value);
  } catch {
    return `not a valid URL: ${value}`;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `must use http: or https: (got ${u.protocol})`;
  if (u.search || u.hash || value.includes('?') || value.includes('#')) return 'must not contain a query string or fragment';
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return { url: u.href };
}

export function checkAuthor(value) {
  if (typeof value !== 'string' || !AUTHOR_RE.test(value)) return `must match ${AUTHOR_RE.source}`;
  return null;
}

let cached;

export function loadConfig() {
  if (cached) return cached;
  const file = configPath();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return (cached = {});
    throw validationError(`cannot read config file ${file}: ${err.message}`);
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    throw validationError(`config file ${file} is not valid JSON: ${err.message}`);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw validationError(`config file ${file} must contain a JSON object`);
  }
  for (const key of Object.keys(obj)) {
    if (!CONFIG_KEYS.includes(key)) throw validationError(`config file ${file}: unknown key "${key}" (allowed: url, author)`);
  }
  if (obj.url !== undefined) {
    const r = checkBaseUrl(obj.url);
    if (typeof r === 'string') throw validationError(`config file ${file}: url ${r}`);
  }
  if (obj.author !== undefined) {
    const e = checkAuthor(obj.author);
    if (e) throw validationError(`config file ${file}: author ${e}`);
  }
  return (cached = obj);
}

export function saveConfig(obj) {
  const file = configPath();
  const dir = path.dirname(file);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = path.join(dir, `.config.json.tmp-${process.pid}-${Date.now()}`);
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
    fs.chmodSync(file, 0o600);
  } catch (err) {
    throw new CliError(EXIT.VALIDATION, 'validation_failed', `cannot write config file ${file}: ${err.message}`);
  }
  cached = obj;
}

export function configView(obj) {
  return { path: configPath(), url: obj.url ?? null, author: obj.author ?? null };
}

// --url > CHAT_URL > config url > default. Returns normalized base URL ending with '/'.
export function resolveUrl(flags = {}, command) {
  let source;
  let value;
  if (flags.url !== undefined) {
    source = '--url';
    value = flags.url;
  } else if (process.env.CHAT_URL) {
    source = 'CHAT_URL';
    value = process.env.CHAT_URL;
  } else {
    const cfg = loadConfig();
    if (cfg.url !== undefined) {
      source = `config file ${configPath()}`;
      value = cfg.url;
    } else {
      value = DEFAULT_URL;
      source = 'default';
    }
  }
  const r = checkBaseUrl(value);
  if (typeof r === 'string') throw usageError(`invalid server URL from ${source}: ${r}`, command);
  return r.url;
}

// --as > CHAT_AUTHOR > config author. Returns null if none is set.
export function resolveAuthor(flags = {}) {
  let source;
  let value;
  if (flags.as !== undefined) {
    source = '--as';
    value = flags.as;
  } else if (process.env.CHAT_AUTHOR) {
    source = 'CHAT_AUTHOR';
    value = process.env.CHAT_AUTHOR;
  } else {
    const cfg = loadConfig();
    if (cfg.author === undefined) return null;
    source = `config file ${configPath()}`;
    value = cfg.author;
  }
  const e = checkAuthor(value);
  if (e) throw validationError(`author from ${source}: ${e}`);
  return value;
}
