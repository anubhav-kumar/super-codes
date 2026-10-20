import fsp from 'node:fs/promises';
import path from 'node:path';
import { CHAT_ID_RE } from '../../lib/constants.js';
import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl } from '../config.js';
import { request, enc, expectObject } from '../api.js';
import { EXIT, invalidResponse, validationError, fileNotFound, usageError } from '../errors.js';
import { printLine } from '../output.js';

const CMD = 'validate';
const LEVELS = ['error', 'warning'];

function checkReport(report, fail) {
  if (report === null || typeof report !== 'object') throw fail('validation report must be an object');
  const { file, lines, valid, problems } = report;
  if (typeof file !== 'string') throw fail('"file" must be a string');
  if (!Number.isSafeInteger(lines) || lines < 0) throw fail('"lines" must be a non-negative integer');
  if (!Number.isSafeInteger(valid) || valid < 0) throw fail('"valid" must be a non-negative integer');
  if (!Array.isArray(problems)) throw fail('"problems" must be an array');
  return {
    file,
    lines,
    valid,
    problems: problems.map((p, i) => {
      const ok =
        p !== null &&
        typeof p === 'object' &&
        (p.line === null || (Number.isSafeInteger(p.line) && p.line >= 0)) &&
        LEVELS.includes(p.level) &&
        typeof p.code === 'string' &&
        typeof p.message === 'string';
      if (!ok) throw fail(`problem #${i + 1} is malformed`);
      return { line: p.line, level: p.level, code: p.code, message: p.message };
    }),
  };
}

function printReport(report) {
  let errors = 0;
  let warnings = 0;
  for (const p of report.problems) {
    if (p.level === 'error') errors++;
    else warnings++;
    printLine(p);
  }
  printLine({ file: report.file, lines: report.lines, valid: report.valid, errors, warnings });
  return errors > 0 ? EXIT.VALIDATION : EXIT.OK;
}

async function runLocal(target, dataDirFlag) {
  let chatId;
  let chatPath;
  let assetsDir;
  if (target.endsWith('.jsonl')) {
    chatPath = path.resolve(target);
    chatId = path.basename(chatPath, '.jsonl');
    if (!CHAT_ID_RE.test(chatId)) throw validationError(`file name ${JSON.stringify(path.basename(chatPath))} is not <chatId>.jsonl with a valid chat id`);
    assetsDir = path.join(path.dirname(chatPath), '..', 'assets', chatId);
  } else {
    chatId = checkChatId(target);
    const dataDir = path.resolve(dataDirFlag ?? process.env.DATA_DIR ?? './data');
    chatPath = path.join(dataDir, 'chats', `${chatId}.jsonl`);
    assetsDir = path.join(dataDir, 'assets', chatId);
  }
  let st;
  try {
    st = await fsp.stat(chatPath);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') throw fileNotFound(chatPath);
    throw validationError(`cannot read ${chatPath}: ${err.message}`);
  }
  if (!st.isFile()) throw validationError(`${chatPath} is not a regular file`);

  const { validateChatFile } = await import('../../lib/validate.js');
  const report = await validateChatFile({ chatId, chatPath, assetsDir });
  return printReport(checkReport(report, (m) => new Error(`lib/validate.js returned a bad report: ${m}`)));
}

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  expectPositionals(CMD, positionals, 1, 1, [values.local ? '<chatId | path.jsonl>' : '<chatId>']);
  if (values.local) return runLocal(positionals[0], values['data-dir']);
  if (values['data-dir'] !== undefined) throw usageError('--data-dir requires --local', CMD);

  const chatId = checkChatId(positionals[0]);
  const base = resolveUrl(values, CMD);
  const body = expectObject(await request(base, 'GET', `api/chats/${enc(chatId)}/validate`), 'GET validate');
  return printReport(checkReport(body, (m) => invalidResponse(`GET validate: ${m}`)));
}
