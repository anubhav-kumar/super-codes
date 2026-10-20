import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl } from '../config.js';
import { request, expectObject, checkSummary } from '../api.js';
import { printSummary } from '../output.js';

export async function run(argv) {
  const { values, positionals } = parseCommand('create', argv);
  expectPositionals('create', positionals, 1, 1, ['<chatId>']);
  const chatId = checkChatId(positionals[0]);
  const base = resolveUrl(values, 'create');
  const body = expectObject(await request(base, 'POST', 'api/chats', { json: { id: chatId } }), 'POST api/chats');
  printSummary(checkSummary(body.chat, chatId));
  return 0;
}
