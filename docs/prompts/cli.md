# Prompt: Build the Agentic Chat **CLI** (`chat`)

You are implementing the command-line client for "Agentic Chat". Its primary users are **AI agents**
(Claude, Codex, OpenCode, …) running shell commands; humans use the web UI. The CLI talks to a server —
local or remote — over HTTP + SSE, and never writes to the server's data directory.

**Read `docs/DESIGN.md` in full before writing any code. It is the source of truth** (especially §5.2, §6,
§8, §9.4, §10, §11, §12, §14). Where this prompt and DESIGN.md seem to disagree, DESIGN.md wins — record the
conflict in DESIGN.md §18 "Open issues".

---

## 0. Hard constraints

- Node.js >= 22, **plain JavaScript ES modules**. No TypeScript, no build step.
- No new dependencies. Use `node:util` `parseArgs`, global `fetch`, `FormData`, `File`, `fs.openAsBlob`,
  `TextDecoderStream`. **No `eventsource` package** — write the SSE parser yourself.
- **Reuse `lib/`** (`constants.js`, `schema.js`, `ulid.js`, `validate.js`) — never re-implement regexes,
  limits, serialization or validation. If a shared helper is missing, add it to `lib/` per DESIGN §13 and
  log it in §18.
- Do **not** write automated tests, test scripts, or Docker files. Do **not** commit or branch.
- Do not touch `server.js`, `server/`, or `public/`.

## 0.1 Contracts (DESIGN §2.1)

You **produce** C13 — the agent-facing CLI contract (§14: commands, §14.1 stdout shapes, §14.2 error codes,
§14.3 exit codes). AI agents and a future agent skill depend on it byte for byte. This prompt elaborates
behavior; the shapes and codes themselves are defined only in DESIGN §14. Don't add fields or codes there
without recording it in §18.

You **consume**:

| Contract | Section | How you use it |
|---|---|---|
| C1 Identifiers, C3 Message/Asset, C7 ChatSummary | §6, §8, §11.2 | Validate every input and every server response with `lib/schema.js` |
| C5 Text conventions | §10 | `asset:$N` on send; `extractMentions` for `watch --mention` |
| C4 Asset unavailability | §9.4 | `asset` exits 4 `asset_missing` |
| C6 Errors | §11.1 | Pass server `code`/`message` through; branch on `code` only |
| C8 Endpoints | §11.3 | Exact paths, params, bodies; relative URLs for path prefixes (§5.2) |
| C9 Health | §11.6 | `chat health` checks and pass conditions |
| C10 SSE | §12 | `message` events, `id:` = message id, `Last-Event-ID` resume, heartbeats |
| C11, C12 Shared lib | §13 | Import by name; never re-implement |
| C14 Config | §5.2 | Flag > env > config file > default |
| C15 Limits | §16 | Prefer the server's `limits` from health over local `LIMITS` |

If `lib/` isn't there yet, stop and say so — don't write your own version.

## 1. What you own

```
bin/chat.js              # #!/usr/bin/env node — parse argv, dispatch, top-level error → exit code
cli/args.js              # parseArgs wrappers, per-command option specs, usage text
cli/config.js            # config file read/write + URL/author resolution (DESIGN §5.2)
cli/api.js               # fetch wrapper: base URL, JSON parsing, error mapping, response validation
cli/sse-client.js        # SSE parser over fetch streams
cli/output.js            # printLine(obj), printMessage(msg), printSummary(c), printError(code, message)
cli/errors.js            # CliError(exitCode, code, message)
cli/commands/list.js create.js info.js read.js send.js watch.js asset.js validate.js config.js health.js
```
`bin/chat.js` must be executable (`chmod +x`) and work both via `npm link` (global `chat`) and
`node bin/chat.js`.

## 2. Output contract (non-negotiable)

- **stdout:** JSONL only. Every line is one complete JSON object + `\n`. Messages via `serializeMessage`,
  chat summaries via `serializeChatSummary`, everything else via `JSON.stringify`. No banners, progress,
  colors or blank lines. The only exception: `--help` prints plain-text usage to stdout, exit 0.
- **stderr:** errors only, one JSON line `{"error":{"code":"...","message":"..."}}`.
- **Exit codes:** exactly DESIGN §14 (0 ok, 1 usage, 2 network/server, 3 validation, 4 not found,
  5 timeout, 6 conflict).
- Write with `process.stdout.write`; finish by setting `process.exitCode` and letting the loop drain (no
  `process.exit()` mid-write). `EPIPE` on stdout (e.g. `| head -1`) → exit quietly, code 0.
- Unhandled exceptions → stderr `internal_error`, exit 2. `CHAT_DEBUG=1` also prints the stack to stderr.

## 3. Validation in both directions ("perfect JSONL")

- **Outgoing** — before any network call, validate with the shared schemas/regexes: chat IDs, author,
  ULIDs, `--tail` (integer 1–`MAX_TAIL`), text (after `normalizeNewlines`: length, `FORBIDDEN_CTRL_RE`,
  non-blank unless attachments), attachments (exist → else exit 4 `file_not_found`; regular file → else
  exit 3; size ≤ `MAX_ASSET_BYTES`; count ≤ `MAX_ASSETS_PER_MESSAGE`), placeholders (`findPlaceholders`
  indices ≤ attachment count). Raw `asset:<ULID>` references are allowed (they may point to earlier
  messages). Failures → exit 3 `validation_failed` (or exit 1 for malformed flags).
- **Limits:** use the server's `limits` from `GET /api/health` when you already fetched it (e.g. `send`
  with attachments fetches health first — cheap, and catches protocol mismatches); otherwise local `LIMITS`.
- **Incoming** — every message (from `read`, `send`, `watch`) must pass `MessageSchema` and have the
  requested `chatId`; every summary must pass `ChatSummarySchema`. SSE `data` must pass `parseMessageLine`
  (includes canonical check) and the SSE `id` must equal `message.id`. `read` results must be strictly
  ascending. Violation → exit 3 `invalid_response`, and the bad object is **not** printed (for `watch`: stop
  and exit 3).

## 4. Config & HTTP layer

### `cli/config.js` (DESIGN §5.2)
- Path: `${XDG_CONFIG_HOME || ~/.config}/agentic-chat/config.json`.
- `loadConfig()`: missing file → `{}`. Invalid JSON or unknown keys or invalid values → exit 3 with the
  path in the message (never silently ignore a broken config).
- `saveConfig(obj)`: `mkdir -p`, write `JSON.stringify(obj, null, 2) + '\n'` to a temp file, rename.
  File mode `0600`.
- `resolveUrl(flags)`: `--url` > `CHAT_URL` > config `url` > `http://localhost:3000`. Must parse as an
  `http:`/`https:` URL with no query/hash (else exit 1). Keep any path prefix; normalize to end with `/`.
- `resolveAuthor(flags)`: `--as` > `CHAT_AUTHOR` > config `author`. Validate with `AUTHOR_RE`.

### `cli/api.js`
- Build every URL as `new URL(relativePath, base)` with **relative** paths (`api/chats/...`), so path
  prefixes work. Encode path params with `encodeURIComponent`.
- `request(method, path, { json, formData, signal, timeoutMs = 30_000 })` → parsed JSON.
- Server error mapping (pass the server's `code`/`message` through):
  400/413/415 → exit 3 · 404 → exit 4 · 409 → exit 6 · 503 → exit 2 · other 5xx or non-JSON → exit 2
  (`server_error`).
- Network failure (`ECONNREFUSED`, `ENOTFOUND`, TLS, reset, timeout) → exit 2 `network_error`, message:
  `cannot reach <base url>: <reason> — run "chat health" to diagnose`.
- No timeout for uploads and streams.

## 5. Commands

Validate all arguments before any I/O. `parseArgs` with `strict: true`; unknown options → exit 1 with a
usage hint. Global options on every command: `--url`, `--help`.

### `chat list` → `GET api/chats` → one ChatSummary per line.
### `chat create <chatId>` → `POST api/chats` → one ChatSummary line. 409 → exit 6.
### `chat info <chatId>` → `GET api/chats/:chatId` → one ChatSummary line.

### `chat read <chatId> [--tail N] [--since ULID] [--before ULID]`
→ `GET api/chats/:chatId/messages` → one message per line, ascending. Nothing else printed (`hasMore` is
not printed; `--help` explains paging with `--before <oldest printed id>`).

### `chat send <chatId> [--as <name>] (<text> | - | --text-file <path>) [--attach <file>]...`
- Author per §4; missing → exit 1.
- Text source — exactly one of: one positional argument; `-` = all of stdin (UTF-8); `--text-file`. None +
  attachments → `""`. Several → exit 1. `--help` tells agents to prefer `-`/`--text-file` for multi-line
  text or text with shell metacharacters.
- Normalize newlines locally so local validation matches the server.
- No attachments → `POST` JSON `{ author, text }`. With attachments → multipart: `author`, `text`, then one
  `files` part per attachment in the given order:
  `form.append('files', await fs.openAsBlob(p, { type: mimeForExt(extOf(name)) ?? 'application/octet-stream' }), name)`.
- Verify the returned message: valid schema, `chatId`/`author` match, `assets.length` and each
  `assets[i].name` match `sanitizeAssetName(basename)`, and `text` equals local text with each `asset:$N`
  replaced by `asset:<assets[N-1].id>`. Mismatch → exit 3 `invalid_response`.
- Print the message (one line).

### `chat watch <chatId> [--since ULID] [--count N] [--timeout S] [--ignore <name>]... [--mention <name>]`
How agents wait for and receive messages. Must work as a long-running stream **and** as a terminating
call for agents whose shell tools block until exit.
- First `GET api/chats/:chatId` (404 → exit 4; network error → exit 2) so typos and outages fail fast.
- Connect to `GET api/chats/:chatId/stream`, with `?since=` on the first connect if given.
- Print each received message immediately (one line, no buffering) after filters:
  `--ignore` (repeatable) skips authors (typically the agent itself); `--mention <name>` keeps only
  messages whose `extractMentions(text)` includes `name`. Filtered messages still advance the cursor.
- `--count N` → exit 0 after printing N. `--timeout S` → overall deadline; on expiry exit 5 `timeout`
  (stderr). Neither → run until SIGINT/SIGTERM, then exit 0.
- **Reconnect** (server restart, network blip, proxy timeout): backoff starting at the server's `retry`
  (default 2 s), doubling to 30 s max, reset after a successful connect. Send `Last-Event-ID: <last seen id>`.
  Dedupe: ignore ids ≤ last seen. 404 on reconnect → exit 4. Retries continue until `--timeout`/signal;
  never print reconnect notices anywhere unless fatal.
- **Liveness:** if nothing (not even a `: ping` heartbeat) arrives for 45 s, abort and reconnect.
- Document in `--help`:
  `chat watch general --since <lastSeenId> --ignore claude --count 1 --timeout 600`

### `chat asset <chatId> <assetId> [-o <path>] [--force]`
- `GET api/chats/:chatId/assets/:assetId` → `{ asset, messageId, available }`. 404 → exit 4 `not_found`.
  `available: false` → exit 4 `asset_missing` (message: `asset <id> (<name>) is referenced but its file is not
  available on the server`).
- Output path: `-o` or `./<asset.name>`. Exists and no `--force` → exit 6 `file_exists`.
- Download `GET assets/<chatId>/<asset.file>` (404 `asset_missing` → exit 4) streaming to `<path>.part`;
  byte count must equal `asset.size` (else delete `.part`, exit 2 `invalid_response`); rename.
- Print `{"asset":{...},"messageId":"...","path":"<absolute path>"}`.

### `chat validate <chatId>` / `chat validate --local <chatId | path.jsonl> [--data-dir <dir>]`
- Default (works remotely): `GET api/chats/:chatId/validate`.
- `--local`: read-only `validateChatFile` from `lib/validate.js`. Argument is a chat ID (resolved to
  `<data-dir>/chats/<chatId>.jsonl`, data dir `--data-dir` > `DATA_DIR` > `./data`) or a path ending in
  `.jsonl` (chat ID = base name, assets dir = `<file dir>/../assets/<chatId>`).
- Output (both modes): one line per problem `{"line":12,"level":"error","code":"not_canonical","message":"..."}`,
  then a summary `{"file":"...","lines":N,"valid":N,"errors":N,"warnings":N}`.
- Exit 0 when there are no `error`-level problems (warnings such as `asset_missing` are fine), 3 if any
  errors, 4 if the chat/file doesn't exist.

### `chat config get [key] | set <key> <value> | unset <key>`
Keys: `url`, `author` (validate values the same way as the flags). `get` without key prints the whole config
plus `"path"`; `get url` prints `{"url":"..."}` (`null` if unset). `set`/`unset` print the new config.

### `chat health [--upload-bytes N]` — DESIGN §11.6
Run the checks in order, each timed:
1. `reach`: `GET api/health` (10 s timeout), JSON parses (even on 503).
2. `server`: status 200 and `ok: true`; on failure include the failing checks' `error`s.
3. `protocol`: `protocol === PROTOCOL_VERSION`; else error `server protocol X, client Y — update the CLI`.
4. `sse`: open `api/health/stream`; pass if `n:1` arrives within 2 s and `n:2` arrives ≥ 800 ms after `n:1`.
   If both arrive together or late → `"responses are buffered between you and the server (proxy?) — live
   updates won't work"`.
5. `upload`: `POST api/health/upload` with `--upload-bytes` (default 65,536, max server `MAX_ASSET_BYTES`)
   random bytes; pass if `receivedBytes` matches. 413/connection reset → `"upload blocked or size-limited
   between you and the server"`.

If `reach` fails, later checks are `{"ok":null}`. Print one line:
`{"url":"...","ok":bool,"server":{...health body or null...},"checks":{"reach":{"ok":true,"ms":12},...}}`.
Exit 0 if all ok, else 2.

## 6. SSE client (`cli/sse-client.js`)
Follow the WHATWG EventSource parsing rules over `response.body.pipeThrough(new TextDecoderStream())`:
- Lines end with `\n`, `\r\n` or `\r` (handle chunk boundaries, including a `\r\n` split across chunks).
- `:`-prefixed lines are comments (heartbeats) — ignore, but they count as activity for liveness.
- `field: value` (strip one leading space); `event`, `data` (multiple lines joined with `\n`), `id` (ignored
  if it contains NUL), `retry` (digits only). A blank line dispatches; no data → not dispatched; default
  event `message`.
- Response must be 200 with `Content-Type` starting `text/event-stream`; otherwise map like §4.
- API: `async function* readEvents(response, { onRetry, onActivity })` yielding `{ id, event, data }`.
  Connection/reconnect logic lives in `watch.js` (and `health.js` uses `readEvents` directly).

## 7. `--help` and `--version`
`chat --help` and `chat <command> --help`: concise plain-text usage — synopsis, options, URL/author
resolution, exit codes, and 2–3 agent-oriented examples (incl. `asset:$N` placeholders, referencing earlier
assets with `asset:<id>`, and the `watch --count 1 --timeout` pattern). This text will seed an agent skill
later, so keep it accurate. `chat --version` → `{"version":"<package.json version>","protocol":1}`.

## 8. Edge cases you must handle

- Server down / wrong URL / DNS failure → exit 2 with the URL and the `chat health` hint, on every command.
  `watch`: only the *first* connect is fatal; later failures retry until timeout/signal.
- Server restarts during `watch` → reconnects, resumes from `Last-Event-ID`, no duplicates, no gaps.
- Remote server behind a path prefix (`--url https://host/chat`) → every request goes under `/chat/`.
- Text with quotes, backticks, `$`, emoji, RTL, NUL (rejected), very long stdin → sent byte-exact or rejected
  with a clear message.
- Referenced asset missing on the server → `chat asset` exits 4 `asset_missing`; `read`/`watch` unaffected.
- Malformed config file → exit 3 naming the file.
- `chat read x --tail 0`, `--tail abc`, invalid ULID in `--since` → exit 1.
- Server sends a message that fails the schema → exit 3 `invalid_response`, not printed.

## 9. Manual verification the owner will run (make sure these work; don't script them)

```bash
npm link
chat health
chat config set url http://localhost:3000 && chat config set author claude
chat create general
chat send general --as anubhav "hello @claude"
printf 'multi\nline `code` $HOME\n' | chat send general -
chat send general 'diagram: asset:$1' --attach ./diagram.png
chat read general --tail 5
chat watch general --ignore claude --count 1 --timeout 60    # post from the web UI meanwhile
chat asset general <assetId> -o /tmp/x.png
rm data/assets/general/<assetId>.png; chat asset general <assetId>; echo $?   # 4 asset_missing
chat validate general; echo $?                                                # 0 (warning only)
chat read nope; echo $?                                                       # 4
CHAT_URL=http://localhost:9999 chat list; echo $?                             # 2
```

## 10. Deliverable

Reply with: files created, how to install (`npm link`), deviations recorded in DESIGN §18, and open
questions. Keep it short.
