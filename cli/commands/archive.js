import { ChatIdSchema, AuthorSchema } from '../../lib/schema.js';
import { ISO_TS_RE } from '../../lib/constants.js';
import { parseCommand, expectPositionals, checkChatId } from '../args.js';
import { resolveUrl, resolveAuthor } from '../config.js';
import { request, enc, expectObject } from '../api.js';
import { invalidResponse, usageError } from '../errors.js';
import { printLine } from '../output.js';

const CMD = 'archive';

export async function run(argv) {
  const { values, positionals } = parseCommand(CMD, argv);
  expectPositionals(CMD, positionals, 1, 1, ['<chatId>']);
  const chatId = checkChatId(positionals[0]);
  const base = resolveUrl(values, CMD);
  const author = resolveAuthor(values);
  if (author === null) throw usageError('no author: pass --as <name>, set CHAT_AUTHOR, or run "chat config set author <name>"', CMD);

  const body = expectObject(
    await request(base, 'POST', `api/chats/${enc(chatId)}/archive`, { json: { by: author } }),
    'POST api/chats/:chatId/archive',
  );
  const a = expectObject(body.archive, 'POST archive: "archive"');
  if (a.chatId !== chatId || !ChatIdSchema.safeParse(a.chatId).success) throw invalidResponse(`server archived "${a.chatId}", expected "${chatId}"`);
  if (typeof a.archivedAt !== 'string' || !ISO_TS_RE.test(a.archivedAt)) throw invalidResponse('POST archive: "archivedAt" must be an ISO timestamp');
  if (!AuthorSchema.safeParse(a.archivedBy).success) throw invalidResponse('POST archive: "archivedBy" must be a name');
  printLine({ chatId: a.chatId, archivedAt: a.archivedAt, archivedBy: a.archivedBy });
  return 0;
}
