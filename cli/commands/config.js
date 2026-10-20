import { parseCommand } from '../args.js';
import { CONFIG_KEYS, loadConfig, saveConfig, configView, checkBaseUrl, checkAuthor } from '../config.js';
import { usageError, validationError } from '../errors.js';
import { printLine } from '../output.js';

const CMD = 'config';

function checkKey(key) {
  if (key === undefined) throw usageError('missing <key> (url or author)', CMD);
  if (!CONFIG_KEYS.includes(key)) throw usageError(`unknown key ${JSON.stringify(key)} (allowed: url, author)`, CMD);
  return key;
}

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  if (values.url !== undefined) throw usageError('--url is not used by "chat config" (use "chat config set url <url>")', CMD);
  const [action, key, value, ...extra] = positionals;

  if (action === 'get') {
    if (value !== undefined) throw usageError(`unexpected argument: ${JSON.stringify(value)}`, CMD);
    const cfg = loadConfig();
    if (key === undefined) printLine(configView(cfg));
    else printLine({ [checkKey(key)]: cfg[key] ?? null });
    return 0;
  }

  if (action === 'set') {
    checkKey(key);
    if (value === undefined) throw usageError('missing <value>', CMD);
    if (extra.length > 0) throw usageError(`unexpected argument: ${JSON.stringify(extra[0])}`, CMD);
    if (key === 'url') {
      const r = checkBaseUrl(value);
      if (typeof r === 'string') throw validationError(`url ${r}`);
    } else {
      const e = checkAuthor(value);
      if (e) throw validationError(`author ${e}`);
    }
    const cfg = { ...loadConfig(), [key]: value };
    saveConfig(cfg);
    printLine(configView(cfg));
    return 0;
  }

  if (action === 'unset') {
    checkKey(key);
    if (value !== undefined) throw usageError(`unexpected argument: ${JSON.stringify(value)}`, CMD);
    const cfg = { ...loadConfig() };
    delete cfg[key];
    saveConfig(cfg);
    printLine(configView(cfg));
    return 0;
  }

  if (action === undefined) throw usageError('missing action: get, set or unset', CMD);
  throw usageError(`unknown action ${JSON.stringify(action)} (get, set or unset)`, CMD);
}
