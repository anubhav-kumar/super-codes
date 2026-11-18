import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl } from '../config.js';
import { fetchParticipants } from '../api.js';
import { printParticipant } from '../output.js';

export async function run(argv) {
  const { values, positionals } = parseCommand('participants', argv);
  expectPositionals('participants', positionals, 1, 1, ['<chatId>']);
  const chatId = checkChatId(positionals[0]);
  const base = resolveUrl(values, 'participants');
  for (const p of await fetchParticipants(base, chatId)) printParticipant(p);
  return 0;
}
