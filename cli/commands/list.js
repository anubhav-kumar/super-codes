import { parseCommand, expectPositionals } from '../args.js';
import { resolveUrl } from '../config.js';
import { request, expectObject, checkSummary } from '../api.js';
import { invalidResponse } from '../errors.js';
import { printSummary } from '../output.js';

export async function run(argv) {
  const { values, positionals } = parseCommand('list', argv);
  expectPositionals('list', positionals, 0, 0, []);
  const base = resolveUrl(values, 'list');
  const body = expectObject(await request(base, 'GET', 'api/chats'), 'GET api/chats');
  if (!Array.isArray(body.chats)) throw invalidResponse('GET api/chats: "chats" must be an array');
  const chats = body.chats.map((c) => checkSummary(c));
  for (const c of chats) printSummary(c);
  return 0;
}
