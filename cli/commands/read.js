import { LIMITS } from '../../lib/constants.js';
import { parseCommand, expectPositionals, checkChatId, checkUlidArg, parseIntFlag } from '../args.js';
import { resolveUrl } from '../config.js';
import { request, enc, expectObject, checkMessage } from '../api.js';
import { invalidResponse } from '../errors.js';
import { printMessage } from '../output.js';

export async function run(argv) {
  const { values, positionals } = parseCommand('read', argv);
  expectPositionals('read', positionals, 1, 1, ['<chatId>']);
  const chatId = checkChatId(positionals[0]);
  const query = {};
  if (values.tail !== undefined) query.tail = parseIntFlag(values.tail, '--tail', 1, LIMITS.MAX_TAIL, 'read');
  if (values.since !== undefined) query.since = checkUlidArg(values.since, '--since', 'read');
  if (values.before !== undefined) query.before = checkUlidArg(values.before, '--before', 'read');
  const base = resolveUrl(values, 'read');

  const body = expectObject(
    await request(base, 'GET', `api/chats/${enc(chatId)}/messages`, { query }),
    'GET api/chats/:chatId/messages',
  );
  if (!Array.isArray(body.messages)) throw invalidResponse('GET messages: "messages" must be an array');
  if (typeof body.hasMore !== 'boolean') throw invalidResponse('GET messages: "hasMore" must be a boolean');
  if (query.tail !== undefined && body.messages.length > query.tail) {
    throw invalidResponse(`GET messages: got ${body.messages.length} messages for --tail ${query.tail}`);
  }

  // Validate everything before printing anything.
  const messages = [];
  let prev = null;
  for (const raw of body.messages) {
    const m = checkMessage(raw, chatId);
    if (prev !== null && !(m.id > prev)) throw invalidResponse(`messages not strictly ascending: ${m.id} after ${prev}`);
    if (query.since !== undefined && !(m.id > query.since)) throw invalidResponse(`message ${m.id} is not after --since ${query.since}`);
    if (query.before !== undefined && !(m.id < query.before)) throw invalidResponse(`message ${m.id} is not before --before ${query.before}`);
    prev = m.id;
    messages.push(m);
  }
  for (const m of messages) printMessage(m);
  return 0;
}
