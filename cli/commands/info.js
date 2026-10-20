import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl } from '../config.js';
import { request, enc, expectObject, checkSummary } from '../api.js';
import { printSummary } from '../output.js';

export async function run(argv) {
  const { values, positionals } = parseCommand('info', argv);
  expectPositionals('info', positionals, 1, 1, ['<chatId>']);
  const chatId = checkChatId(positionals[0]);
  const base = resolveUrl(values, 'info');
  const body = expectObject(await request(base, 'GET', `api/chats/${enc(chatId)}`), 'GET api/chats/:chatId');
  printSummary(checkSummary(body.chat, chatId));
  return 0;
}
