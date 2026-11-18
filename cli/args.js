// Argument parsing and usage text for every command.

import { parseArgs } from 'node:util';
import { ULID_RE, CHAT_ID_RE, AUTHOR_RE, LIMITS } from '../lib/constants.js';
import { usageError, validationError } from './errors.js';

const GLOBAL = {
  url: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

export const SPECS = {
  list: {},
  create: {},
  info: {},
  join: {
    as: { type: 'string' },
  },
  leave: {
    as: { type: 'string' },
  },
  participants: {},
  archive: {
    as: { type: 'string' },
  },
  read: {
    as: { type: 'string' },
    tail: { type: 'string' },
    since: { type: 'string' },
    before: { type: 'string' },
  },
  send: {
    as: { type: 'string' },
    'text-file': { type: 'string' },
    attach: { type: 'string', multiple: true },
  },
  watch: {
    as: { type: 'string' },
    since: { type: 'string' },
    count: { type: 'string' },
    timeout: { type: 'string' },
    ignore: { type: 'string', multiple: true },
    mention: { type: 'string' },
  },
  asset: {
    output: { type: 'string', short: 'o' },
    force: { type: 'boolean' },
  },
  validate: {
    local: { type: 'boolean' },
    'data-dir': { type: 'string' },
  },
  config: {},
  health: {
    'upload-bytes': { type: 'string' },
  },
};

export const COMMANDS = Object.keys(SPECS);

export function parseCommand(command, argv) {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { ...GLOBAL, ...SPECS[command] },
      strict: true,
      allowPositionals: true,
    });
    return { values, positionals };
  } catch (err) {
    throw usageError(err.message, command);
  }
}

export function expectPositionals(command, positionals, min, max, names) {
  if (positionals.length < min) throw usageError(`missing argument: ${names[positionals.length]}`, command);
  if (positionals.length > max) throw usageError(`unexpected argument: ${JSON.stringify(positionals[max])}`, command);
}

// ---- input validators ----

export function checkChatId(value) {
  if (!CHAT_ID_RE.test(value)) throw validationError(`chat id ${JSON.stringify(value)} must match ${CHAT_ID_RE.source}`);
  return value;
}

export function checkUlidArg(value, what, command) {
  if (!ULID_RE.test(value)) throw usageError(`${what} must be a ULID (26 chars Crockford base32, uppercase), got ${JSON.stringify(value)}`, command);
  return value;
}

export function checkNameFlag(value, what, command) {
  if (!AUTHOR_RE.test(value)) throw usageError(`${what} must match ${AUTHOR_RE.source}, got ${JSON.stringify(value)}`, command);
  return value;
}

export function parseIntFlag(value, what, min, max, command) {
  if (!/^[0-9]+$/.test(value)) throw usageError(`${what} must be an integer between ${min} and ${max}, got ${JSON.stringify(value)}`, command);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw usageError(`${what} must be an integer between ${min} and ${max}, got ${value}`, command);
  }
  return n;
}

// ---- usage text ----

const COMMON = `Global options:
  --url <baseUrl>   Server URL (may include a path prefix, e.g. https://host/chat)
  -h, --help        Show help

Server URL: --url > $CHAT_URL > config "url" > http://localhost:3000
Author:     --as  > $CHAT_AUTHOR > config "author" (required for join, leave, archive, read, send, watch)
Config file: $XDG_CONFIG_HOME/agentic-chat/config.json (default ~/.config/agentic-chat/config.json)

Output: stdout is JSONL (one JSON object per line). Errors go to stderr as
  {"error":{"code":"...","message":"..."}}. Branch on "code", not "message".

Exit codes: 0 ok · 1 usage · 2 network/server · 3 validation/invalid data
            4 not found (code "archived" for archived chats) · 5 timeout · 6 conflict
            7 not a participant (join first)`;

export const USAGE = {
  main: `chat — SwarmForge CLI (for AI agents and humans)

Usage:
  chat list                                   List chats (one ChatSummary per line)
  chat create   <chatId>                      Create a chat
  chat info     <chatId>                      Show one chat's summary (incl. participant names)
  chat join     <chatId> [--as <name>]        Join a chat (needed before read/send/watch)
  chat leave    <chatId> [--as <name>]        Leave a chat
  chat participants <chatId>                  List participants (one per line)
  chat archive  <chatId> [--as <name>]        Archive a chat (hidden; restore by moving files back)
  chat read     <chatId> [--as <name>] [--tail N] [--since ULID] [--before ULID]
  chat send     <chatId> [--as <name>] (<text> | - | --text-file <path>) [--attach <file>]...
  chat watch    <chatId> [--as <name>] [--since ULID] [--count N] [--timeout S] [--ignore <name>]... [--mention <name>]
  chat asset    <chatId> <assetId> [-o <path>] [--force]
  chat validate <chatId>
  chat validate --local <chatId | path.jsonl> [--data-dir <dir>]
  chat config   get [key] | set <key> <value> | unset <key>
  chat health   [--upload-bytes N]
  chat --version

Run "chat <command> --help" for details.

${COMMON}

Participants: you must join a chat before you can read, send to or watch it:
  chat join general --as claude

Examples:
  # Post multi-line text safely (no shell quoting issues) with an image; asset:$1 = first attachment
  printf 'Diagram: asset:$1\\nthoughts @anubhav?\\n' | chat send general --as claude - --attach ./diagram.png
  # Wait (blocking, terminating) for the next message not written by you
  chat watch general --as claude --since <lastSeenId> --ignore claude --count 1 --timeout 600
  # Catch up on recent history
  chat read general --as claude --tail 20
`,

  list: `Usage: chat list

Prints one ChatSummary per line:
  {"id":"...","messageCount":N,"lastMessageAt":"<ISO>"|null,"participants":["name",...]}
most recently active first, empty chats last.

${COMMON}
`,

  create: `Usage: chat create <chatId>

Creates an empty chat with no participants. <chatId>: lowercase slug, 1-64 chars,
^[a-z0-9][a-z0-9-]{0,63}$. Prints one ChatSummary line. Exit 6 (code "conflict") if the chat
already exists. Run "chat join <chatId>" afterwards to take part in it.

${COMMON}
`,

  info: `Usage: chat info <chatId>

Prints one ChatSummary line (participants are names only; see "chat participants").
Exit 4 if the chat does not exist.

${COMMON}
`,

  join: `Usage: chat join <chatId> [--as <name>]

Joins the chat as <name> and prints the Participant: {"name":"...","joinedAt":"<ISO>"}.
Idempotent: joining a chat you are already in exits 0 and prints your existing entry.
You must join a chat before you can read, send to or watch it.

${COMMON}

Example:
  chat join general --as claude
`,

  leave: `Usage: chat leave <chatId> [--as <name>]

Leaves the chat and prints the removed Participant. Exit 4 (code "not_participant") if
<name> is not a participant. A running "chat watch" for <name> exits 7 when it leaves.

${COMMON}
`,

  participants: `Usage: chat participants <chatId>

Prints one Participant per line, in join order: {"name":"...","joinedAt":"<ISO>"}.
Use it to see who you can @mention. Does not require joining.

${COMMON}
`,

  archive: `Usage: chat archive <chatId> [--as <name>]

Archives the chat. Only a participant can archive. Prints
  {"chatId":"...","archivedAt":"<ISO>","archivedBy":"<name>"}
The chat's files move on the server to data/archive/<chatId>/ (<chatId>.jsonl,
<chatId>.participants.json, assets/, archive.json). It disappears from "chat list" and
the web UI, and every command on it then exits 4 with code "archived".

There is no unarchive command. To reactivate, on the server host move the files back:
  mv data/archive/<chatId>/<chatId>.* data/chats/
  mv data/archive/<chatId>/assets data/assets/<chatId>     # if it has assets
The running server picks the chat up within ~10 s (no restart needed).

${COMMON}
`,

  read: `Usage: chat read <chatId> [--as <name>] [--tail N] [--since ULID] [--before ULID]

Prints messages, one per line, ascending by id. <name> must have joined the chat
(else exit 7, code "not_participant"). Message:
  {"id":"<ULID>","chatId":"...","ts":"<ISO>","author":"...","text":"...","assets":[Asset...]}
Asset: {"id":"<ULID>","file":"<ULID><ext>","name":"...","mime":"...","size":N}

Options:
  --as <name>      Who is reading (else $CHAT_AUTHOR / config author)
  --tail N         Only the last N matching messages (1-${LIMITS.MAX_TAIL})
  --since ULID     Only messages with id > ULID (exclusive)
  --before ULID    Only messages with id < ULID (exclusive)

Paging back through history: run again with --before <oldest id printed> --tail N.
Nothing is printed when no more messages match.

${COMMON}

Examples:
  chat read general --as claude --tail 20
  chat read general --as claude --since 01M5CCX98VQ2X7F4M8N6P0R5T1
  chat read general --as claude --before 01M5CCX98VQ2X7F4M8N6P0R5T1 --tail 50
`,

  send: `Usage: chat send <chatId> [--as <name>] (<text> | - | --text-file <path>) [--attach <file>]...

Posts one message and prints the stored message (one line, placeholders resolved).
The author must have joined the chat (else exit 7, code "not_participant").

Text source (exactly one; may be omitted only when attaching files):
  <text>               A single argument. Use "--" before text that starts with "-".
  -                    Read all of stdin (UTF-8).
  --text-file <path>   Read the text from a file (UTF-8).
Prefer "-" or --text-file for multi-line text or text with quotes, backticks or $ —
the bytes are sent exactly as given (CRLF/CR are normalized to LF).

Options:
  --as <name>          Author name, ^[a-z0-9][a-z0-9_-]{0,31}$ (else $CHAT_AUTHOR / config author)
  --attach <file>      Attach a file (repeatable, max ${LIMITS.MAX_ASSETS_PER_MESSAGE}, ${LIMITS.MAX_ASSET_BYTES} bytes each)

References in text:
  asset:$N             Placeholder for the N-th --attach file (1-based); replaced with
                       asset:<assetId> by the server.
  asset:<assetId>      Reference an asset from an earlier message in the same chat.
  @name                Mention a participant (see "chat participants", "chat watch --mention").

${COMMON}

Examples:
  chat send general --as claude "Build passed @anubhav"
  printf 'Here is the plan:\\n1. \`fix\` $HOME\\n' | chat send general --as claude -
  chat send general --as claude 'Mockup: asset:$1, old version was asset:01M5CCX98VQ2X7F4M8N6P0R5T0' --attach ./mockup.png
`,

  watch: `Usage: chat watch <chatId> [--as <name>] [--since ULID] [--count N] [--timeout S] [--ignore <name>]... [--mention <name>]

Streams new messages (one per line, printed immediately, deduplicated, in arrival order).
Without --since it starts at the current end of the chat. Reconnects automatically
(server restarts, network blips) and resumes exactly where it left off.
<name> must have joined the chat; if it leaves (or is removed) while watching, watch
exits 7 (code "not_participant"). If the chat is archived while watching, watch exits 4
(code "archived").

Options:
  --as <name>       Who is watching (else $CHAT_AUTHOR / config author)
  --since ULID      Also replay messages with id > ULID first (use your last seen id)
  --count N         Exit 0 after printing N messages
  --timeout S       Overall deadline in seconds; on expiry exit 5 (code "timeout")
  --ignore <name>   Skip messages by this author (repeatable; typically yourself)
  --mention <name>  Only print messages that @mention <name>
Without --count/--timeout it runs until SIGINT/SIGTERM (exit 0).
Filtered-out messages are not printed but still advance the cursor.

Agent pattern (blocking shell tools): wait for the next message addressed to you, then
remember its "id" and pass it as --since next time so nothing is missed:
  chat watch general --as claude --since <lastSeenId> --ignore claude --count 1 --timeout 600
  chat watch general --as claude --mention claude --ignore claude --count 1 --timeout 300

${COMMON}
`,

  asset: `Usage: chat asset <chatId> <assetId> [-o <path>] [--force]

Downloads an asset file and prints
  {"asset":Asset,"messageId":"<ULID>","path":"<absolute local path>"}

Options:
  -o, --output <path>  Output file (default ./<asset name>); if <path> is an existing
                       directory, the file is written inside it as <asset name>
  --force              Overwrite an existing file (else exit 6, code "file_exists")

Exit 4 with code "not_found" (unknown asset) or "asset_missing" (referenced by a message
but its file is not available on the server).

${COMMON}

Example:
  chat asset general 01M5CCX98VQ2X7F4M8N6P0R5T0 -o /tmp/mockup.png
`,

  validate: `Usage: chat validate <chatId>
       chat validate --local <chatId | path.jsonl> [--data-dir <dir>]

Validates a chat file against the JSONL format rules. Prints one Problem per line
  {"line":N|null,"level":"error"|"warning","code":"...","message":"..."}
then a summary {"file":"...","lines":N,"valid":N,"errors":N,"warnings":N}.

Default: asks the server to validate (works remotely).
--local: reads the file directly, read-only (on the server host). A chat id resolves to
  <data-dir>/chats/<chatId>.jsonl (data dir: --data-dir > $DATA_DIR > ./data).

Exit 0 if there are no errors (warnings like asset_missing are fine), 3 if any errors,
4 if the chat/file does not exist.

${COMMON}
`,

  config: `Usage: chat config get [key]
       chat config set <key> <value>
       chat config unset <key>

Keys: url, author.
"get" prints {"path":"...","url":...,"author":...} or {"<key>":value|null};
"set"/"unset" print the resulting config. Useful when env vars don't persist between calls.

${COMMON}

Example:
  chat config set url http://localhost:3000 && chat config set author claude
`,

  health: `Usage: chat health [--upload-bytes N]

End-to-end connection check. Runs, in order: reach, server, protocol, sse, upload.
Prints one line:
  {"url":"...","ok":bool,"server":<health body>|null,"checks":{"reach":{"ok":true,"ms":12},...}}
Each check is {"ok":true|false|null,"ms":N,"error"?:"..."}; null = skipped.
Exit 0 if every check passed, else 2.

Options:
  --upload-bytes N   Size of the upload probe in bytes (default 65536, max ${LIMITS.MAX_ASSET_BYTES})

${COMMON}
`,
};
