import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl, resolveAuthor } from '../config.js';
import { request, enc, expectObject, checkParticipant } from '../api.js';
import { invalidResponse, usageError } from '../errors.js';
import { printParticipant } from '../output.js';

const CMD = 'join';

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  expectPositionals(CMD, positionals, 1, 1, ['<chatId>']);
  const chatId = checkChatId(positionals[0]);
  const base = resolveUrl(values, CMD);
  const author = resolveAuthor(values);
  if (author === null) throw usageError('no author: pass --as <name>, set CHAT_AUTHOR, or run "chat config set author <name>"', CMD);

  // Idempotent: joining a chat you are already in prints your existing participant entry.
  const body = expectObject(
    await request(base, 'POST', `api/chats/${enc(chatId)}/participants`, { json: { name: author } }),
    'POST api/chats/:chatId/participants',
  );
  const participant = checkParticipant(body.participant);
  if (participant.name !== author) throw invalidResponse(`server joined "${participant.name}", expected "${author}"`);
  printParticipant(participant);
  return 0;
}
