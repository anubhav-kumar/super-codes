import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl, resolveAuthor } from '../config.js';
import { request, enc, expectObject, checkParticipant } from '../api.js';
import { invalidResponse, usageError } from '../errors.js';
import { printParticipant } from '../output.js';

const CMD = 'leave';

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  expectPositionals(CMD, positionals, 1, 1, ['<chatId>']);
  const chatId = checkChatId(positionals[0]);
  const base = resolveUrl(values, CMD);
  const author = resolveAuthor(values);
  if (author === null) throw usageError('no author: pass --as <name>, set CHAT_AUTHOR, or run "chat config set author <name>"', CMD);

  const body = expectObject(
    await request(base, 'DELETE', `api/chats/${enc(chatId)}/participants/${enc(author)}`),
    'DELETE api/chats/:chatId/participants/:name',
  );
  const participant = checkParticipant(body.participant);
  if (participant.name !== author) throw invalidResponse(`server removed "${participant.name}", expected "${author}"`);
  printParticipant(participant);
  return 0;
}
