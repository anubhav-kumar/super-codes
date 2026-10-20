# Prompt: Build the Agentic Chat **Server** (+ shared `lib/`)

You are implementing the server for "Agentic Chat", a deliberately simple chat app where humans (web UI)
and independent AI agents (CLI) talk in shared rooms. Files on disk are the database. The server may run
locally or on a remote host.

**Read `docs/DESIGN.md` in full before writing any code. It is the source of truth.** This prompt adds
implementation guidance. Where the two seem to disagree, DESIGN.md wins — and you record the conflict in
DESIGN.md §18 "Open issues".

---

## 0. Hard constraints

- Node.js >= 22, **plain JavaScript ES modules**. No TypeScript, no `.ts` files, no build step.
- Only dependency: **`zod` ^4**. Everything else: Node built-ins (`node:http`, `node:fs`, `node:fs/promises`,
  `node:path`, `node:stream`, `node:url`, global `fetch`/`Request`/`FormData`/`crypto`).
- Do **not** write automated tests, test scripts, or Docker files. The owner verifies manually.
- Do **not** commit, branch, or create worktrees. Edit files in place.
- Keep modules small and readable. Plain functions; no frameworks, no clever abstractions.
- Never log or return stack traces to clients. Never log message text or asset contents.

## 0.1 Contracts (DESIGN §2.1)

You are the **producer** of almost every contract, so other tasks are coding against your output right now.
Implement these exactly; do not add, rename or reorder fields.

| Contract | Section | You must |
|---|---|---|
| C1 Identifiers | §6 | Generate IDs only via `ulid({ after })`; enforce regexes on every input |
| C2 Chat file | §7 | Write canonical lines only; recover on load; never rewrite lines |
| C3 Message/Asset | §8 | Emit only objects that pass `MessageSchema`, serialized with `serializeMessage` |
| C4 Assets | §9 | Naming, headers, `asset_missing` vs `not_found` |
| C5 Text conventions | §10 | Resolve `asset:$N`; never existence-check `asset:<id>` refs |
| C6 Errors | §11.1 | Exact body shape and codes; invalid path params → 404 |
| C7, C8 | §11.2–§11.5 | Exact request/response bodies and status codes per endpoint |
| C9 Health | §11.6 | Exact health body, probe stream timing, upload probe |
| C10 SSE | §12 | Event names, `id:` lines, `data:` = canonical line, resume precedence |
| C11, C12 Shared lib | §13 | Exact exports and signatures — the CLI and web import them by name |
| C15 Limits | §16 | `LIMITS` in `lib/constants.js`, also returned by `/api/health` |

You **consume** C14 (config: `PORT`, `HOST`, `DATA_DIR`, `CORS_ORIGIN`, §5.1).

## 1. What you own

```
package.json
.gitignore
lib/constants.js   lib/ulid.js   lib/schema.js   lib/validate.js     # shared — CLI and web depend on these
server.js
server/router.js   server/store.js   server/sse.js   server/http-utils.js   server/health.js
```

Build `lib/` **first and exactly to DESIGN.md §13** — the CLI and web tasks are written against that
contract in parallel with or after you. Do not touch `bin/`, `cli/`, or `public/`. If `public/` doesn't exist
yet, the server must still start (static routes just 404).

## 2. `package.json` and `.gitignore`

```json
{
  "name": "agentic-chat",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "chat": "bin/chat.js" },
  "scripts": { "start": "node server.js", "dev": "node --watch server.js" },
  "engines": { "node": ">=22" },
  "dependencies": { "zod": "^4.0.0" }
}
```
`.gitignore` must contain `node_modules/` and `data/` (keep the existing `**/node_modules/*` line).
Run `npm install` once so `zod` is available.

## 3. `lib/` — shared library (DESIGN §13)

### 3.1 `lib/constants.js` (zero deps, must run unmodified in the browser)
- Export every name in DESIGN §13.1 (including `PROTOCOL_VERSION = 1` and `ZERO_ULID`), with the exact
  regexes from §6, §8, §10. Named exports only, no Node APIs.
- `extractAssetRefs`, `extractMentions`, `findPlaceholders`: use `String.prototype.matchAll` on a
  module-private global regex (it clones the regex, so no `lastIndex` leaks) or create a fresh `RegExp` per
  call. Return unique values in first-appearance order.
- `resolvePlaceholders(text, assetIds)`: replace every `asset:$N` with `asset:${assetIds[N-1]}`. If any
  N > `assetIds.length` → `{ ok: false, error: 'text: placeholder asset:$N has no matching attachment' }`.
- `normalizeNewlines(text)`: `\r\n` → `\n`, then lone `\r` → `\n`.
- `sanitizeAssetName(name)`: DESIGN §9.2. Part after the last `/` or `\`, strip `FORBIDDEN_CTRL_RE` chars,
  `\r`, `\n`, trim, slice to `MAX_ASSET_NAME_CHARS`, default `'file'`.
- `extOf(name)`: lowercased last extension if it matches `^\.[a-z0-9]{1,10}$`, else `''`.
- `mimeForExt(ext)`: lookup in `EXT_MIME`, else `null`.
- `tokenizeText(text)`: ordered tokens `{ type: 'text' | 'asset' | 'mention' | 'url', value }`:
  - `asset` → value is the ULID; `mention` → the name without `@`; `url` → full `http(s)://` URL with
    trailing `.,;:!?)]'"` trimmed off (trimmed chars become text); `text` → literal text.
  - Adjacent text tokens are merged. Re-joining every token's source text must reproduce the input exactly.
  - No markdown handling here — the web UI handles code spans/blocks before calling this.

### 3.2 `lib/ulid.js` (zero deps)
- Crockford base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ`; 48-bit ms time (10 chars) + 80-bit random (16 chars).
- `ulid({ after } = {})`: floor = max(`after`, last generated ID) by string comparison. If `Date.now()` >
  floor's time → fresh time + fresh random. Else → reuse floor's time part and increment floor's random
  part by 1 with base32 carry; random overflow → throw. Validate `after` with `ULID_RE` (throw if invalid).
  The result is always strictly greater than both `after` and every previous result.
- `ulidTime(id)`: decode first 10 chars → epoch ms. Throw on invalid input.

### 3.3 `lib/schema.js` (zod)
- `ChatIdSchema`, `AuthorSchema`, `UlidSchema`: `z.string().regex(...)`.
- `AssetSchema = z.strictObject({ id, file, name, mime, size })`; refine `file === id + extOf(name)` (and
  matches `ASSET_FILE_RE`); `name` 1–`MAX_ASSET_NAME_CHARS` and equal to `sanitizeAssetName(name)`; `mime`
  matches `MIME_RE`; `size` is an integer 0–`MAX_ASSET_BYTES`.
- `MessageSchema = z.strictObject({ id, chatId, ts, author, text, assets })` + `superRefine`:
  - `ts` matches `ISO_TS_RE` and equals `new Date(ulidTime(id)).toISOString()`.
  - `text` ≤ `MAX_TEXT_CHARS`, contains no `\r`, no `FORBIDDEN_CTRL_RE` match, no placeholders.
  - `text.trim() === ''` only when `assets.length > 0`.
  - `assets.length` ≤ `MAX_ASSETS_PER_MESSAGE`; asset IDs unique; every asset ID < message ID.
  - **No** check that text refs exist in `assets` — cross-message and unknown refs are valid (DESIGN §8).
- `ChatSummarySchema = z.strictObject({ id, messageCount, lastMessageAt })` (`lastMessageAt` ISO or `null`).
- `SendInputSchema = z.strictObject({ author: AuthorSchema, text: z.string().max(MAX_TEXT_CHARS) })`.
- `serializeMessage(m)` / `serializeChatSummary(c)`: build new objects in canonical key order
  (message: `id, chatId, ts, author, text, assets`; asset: `id, file, name, mime, size`; summary:
  `id, messageCount, lastMessageAt`), then `JSON.stringify` with no spacing.
- `parseMessageLine(line)`: `JSON.parse` (fail → `{ ok:false, code:'invalid_json', error }`), then
  `MessageSchema.safeParse` (fail → `code:'schema'`, `formatZodError`), then
  `serializeMessage(parsed) === line` (fail → `code:'not_canonical'`). Success → `{ ok:true, message }`.
- `formatZodError(err)`: `"path.to.field: message; other: message"` from `err.issues`.

### 3.4 `lib/validate.js` (Node only) — DESIGN §7.1, §13.4
`validateChatFile({ chatId, chatPath, assetsDir })`:
1. Read the file as a **Buffer**. Missing → throw an error with `code: 'ENOENT'` (callers map to 404).
2. File-level: BOM (`EF BB BF`) → `bom`; decode with `new TextDecoder('utf-8', { fatal: true })` (fail →
   `invalid_utf8`, stop); any `\r` → `crlf` (report line numbers); non-empty and not ending with `\n` →
   `no_final_newline`.
3. Split on `\n` (drop the final empty segment). For each line (1-based): empty → `blank_line`; else
   `parseMessageLine` (use its `code`); `chatId` ≠ expected → `chat_id_mismatch`; id ≤ previous valid id →
   `id_order`; id already seen → `duplicate_id`.
4. For each asset of each valid message: `stat(assetsDir/<file>)` — missing → warning `asset_missing`;
   size differs → warning `asset_size_mismatch`.
5. Any `<chatId>.jsonl.partial-*` sibling → warning `partial_file_present` (`line: null`).
6. Return `{ file: basename, lines, valid, problems }`, problems sorted by line.

## 4. `server/http-utils.js`
- `sendJson(res, status, body, headers?)` — `Content-Type: application/json; charset=utf-8`, `Content-Length`.
- `sendError(res, status, code, message)` — DESIGN §11.1 shape.
- `HttpError(status, code, message)` so handlers can `throw`; one top-level `try/catch` converts it.
  Unknown errors → 500 `internal_error` with a generic message; log the stack server-side.
- `readJsonBody(req)` — requires `Content-Type` starting `application/json` (else 415), reads at most
  `MAX_JSON_BODY_BYTES` (else 413, stop reading early), parses (else 400 `bad_request`).
- `readMultipart(req, maxBytes)` — reject early if `Content-Length` > maxBytes (413). Pipe the request through
  a byte-counting `Transform` that errors on overflow, `Readable.toWeb`, then
  `new Request('http://local' + req.url, { method: 'POST', headers: req.headers, body, duplex: 'half' })`
  and `await request.formData()`. Parse failures → 400 `bad_request`; overflow → 413. Content type not
  `multipart/form-data` → 415.
- `applyCors(req, res)` — DESIGN §11.5, **fail closed**. Reads `CORS_ORIGIN` once at startup (default
  `''` = same-origin only; `*` allowed but logs a warning). Echo the request `Origin` only if allowlisted
  (+ `Vary: Origin`). `OPTIONS` → 204 with preflight headers for allowlisted origins, else 403.
- `checkOrigin(req)` — `POST` with an `Origin` that is neither the server's own origin nor allowlisted →
  403 `forbidden_origin`. No `Origin` header (CLI, curl) → allowed.
- `checkHost(req)` — `Host` not in `ALLOWED_HOSTS` (default: `localhost`, `127.0.0.1`, `[::1]` with any port
  when `HOST` is loopback; no check otherwise) → 421 `misdirected_request`. Runs before routing.
- `serveStatic(res, absRoot, relPath)` — `path.resolve(absRoot, '.' + decodedPath)` and require the result
  to be inside `absRoot` (`=== absRoot` or `startsWith(absRoot + path.sep)`); else 404. Small content-type
  map (`.html .css .js .svg .png .ico .json .webmanifest`). `Cache-Control: no-cache`.
- Request log line on completion: `2026-10-20T10:15:00.123Z GET /api/chats 200 3ms`. SSE: log on open and on
  close with duration. Never log bodies.

## 5. `server/router.js`
Register `(method, pattern, handler)` with patterns like `/api/chats/:chatId/messages`. Params decoded with
`decodeURIComponent`; a decode error or a param failing its regex → **404** (DESIGN §11.1), never 400. `HEAD` matches `GET` routes automatically unless registered explicitly.
Path matches but method doesn't → 405 `method_not_allowed` with an `Allow` header. Unmatched `/api/*` →
JSON 404; other paths fall through to static.

## 6. `server/store.js` — the file store

State per chat: `{ messages: Message[], assetIndex: Map<assetId, { asset, messageId }>, lastId }`, plus a
`Map<chatId, Promise>` of write queues and global load stats for health.

- `init(dataDir)` — DESIGN §7.4 steps 1–4, run once before the server listens:
  1. `mkdir -p` `chats/`, `assets/`.
  2. Delete every `assets/*/.tmp-*`; log the count.
  3. For each `chats/*.jsonl` with a valid chat ID (sorted), `loadChat(chatId)`; a failing chat is logged
     and skipped, startup continues.
  4. Log per chat (`loaded chat=general messages=812 invalid=0 missingAssets=1`) and the total summary.
- `loadChat(chatId)`:
  - Read as Buffer. If non-empty and the last byte isn't `0x0A`: find the last `0x0A`, write the bytes after
    it to `<chatId>.jsonl.partial-<Date.now()>`, `fs.truncate` the chat file to `lastNewline + 1` (0 if none),
    log a warning, increment `partialRecovered`.
  - Decode UTF-8, split lines, `parseMessageLine` each; also enforce `chatId` match and strictly increasing
    ids. Invalid lines → `WARN chat=<id> line=<n> <code>: <error>`, count in `invalidLines`, skip.
  - Build `assetIndex`; `stat` each asset file; missing → `WARN chat=<id> asset=<assetId> file missing`,
    count in `missingAssets`.
- `listChatIds()`, `hasChat(chatId)`, `getSummary(chatId)` → `{ id, messageCount, lastMessageAt }`.
- `createChat(chatId)` — `writeFile(path, '', { flag: 'wx' })`; `EEXIST` → `HttpError(409, 'conflict')`.
  Add an empty cache entry.
- `queryMessages(chatId, { since, before, tail })` — string comparisons, then last `tail`.
  Returns `{ messages, hasMore }`.
- `getAsset(chatId, assetId)` → `{ asset, messageId, available }` (`available` via `stat` now) or `null`.
- `assetPath(chatId, file)` → absolute path (only after regex validation by the caller).
- `appendMessage(chatId, { author, text, files })`:
  - **Before the queue** (cheap checks): chat exists; `SendInputSchema`; `files.length` ≤
    `MAX_ASSETS_PER_MESSAGE` (413); each `file.size` ≤ `MAX_ASSET_BYTES` (413); after
    `normalizeNewlines`, text non-blank unless files present (400 `validation_failed`).
  - **Inside `enqueue(chatId, fn)`** (promise chain; a rejected task must not break later tasks), DESIGN §7.3:
    1. `mkdir -p assets/<chatId>/`.
    2. Per file: `assetId = ulid({ after: chat.lastId })`, `name = sanitizeAssetName(file.name)`,
       `ext = extOf(name)`, `fileName = assetId + ext`, mime per §9.2. Write
       `Buffer.from(await file.arrayBuffer())` to `.tmp-<assetId>`, `rename` to `fileName`. Track paths.
    3. `id = ulid({ after: lastAssetId ?? chat.lastId })` so the message ID is greater than its asset IDs
       and the chat's last ID; `ts = new Date(ulidTime(id)).toISOString()`.
    4. `resolvePlaceholders(normalizedText, assetIds)`; error → 400 `validation_failed`.
    5. Build the message, `MessageSchema.safeParse`; error → 400 `validation_failed` (`formatZodError`).
    6. `appendFile(chatPath, serializeMessage(msg) + '\n')`.
    7. Any error after step 2 began → best-effort `rm -f` of every written/tmp file, rethrow.
    8. Update cache (`messages`, `assetIndex`, `lastId`), return the message.
- `stats()` → `{ chats, messages, invalidLines, missingAssets, partialRecovered }` for health.
- `drain()` → await all queues (shutdown).

## 7. `server/sse.js` — SSE hub
- `openStream(req, res)` — headers per DESIGN §12 (plus CORS via `applyCors`), `res.flushHeaders()`,
  `req.socket.setTimeout(0)`, `setNoDelay(true)`, `setKeepAlive(true)`; write `retry: 2000\n\n`. Track
  `res`; on `req` `'close'` remove it everywhere.
- `subscribeChat(chatId, res, resumeId)` — **synchronously** write every cached message with
  `id > resumeId` (if `resumeId`), then add `res` to the chat's subscriber set. No `await` in between.
- `subscribeGlobal(res)`.
- `broadcastMessage(msg)` → `id: ${msg.id}\nevent: message\ndata: ${serializeMessage(msg)}\n\n`.
- `broadcastChat(summary)` → `event: chat\ndata: ${serializeChatSummary(summary)}\n\n` to global subscribers.
- One heartbeat `setInterval(15_000)` (`unref()`) writing `: ping\n\n` to every open stream.
- A write that throws → drop that subscriber. `res.write` returning `false` is fine (Node buffers).
- `closeAll()` for shutdown.

## 8. `server/health.js` — DESIGN §11.6
- `GET|HEAD /api/health`: `Cache-Control: no-store`.
  - `dataDir` check: `name = '.health-' + ulid()`; `writeFile(data/name, 'ok')`, `readFile` must equal
    `'ok'`, `rm`. Set `readable`/`writable` accordingly; any failure → `ok:false`, `error: err.code ?? message`.
    Also check `readdir(chats/)` succeeds for `readable`. Always clean up the probe file.
  - `store` check: `{ ok: true, ...store.stats() }`.
  - Body exactly per DESIGN §11.6 (`ok`, `protocol: PROTOCOL_VERSION`, `version` from `package.json`,
    `startedAt`, `uptimeSec`, `checks`, `limits: LIMITS`). 200 if all ok, else 503.
- `GET /api/health/stream`: `openStream`, write `event: probe\ndata: {"n":1}\n\n` immediately, after 1000 ms
  write `{"n":2}`, then `res.end()`. Clear the timer if the client disconnects. Not a subscriber.
- `POST /api/health/upload`: `readMultipart` with limit `MAX_ASSET_BYTES + MAX_JSON_BODY_BYTES`; exactly
  one `files` part (else 400); respond `{ ok: true, receivedBytes: file.size }`. Nothing written to disk.

## 9. `server.js` — routes (DESIGN §11.3)

| Route | Notes |
|---|---|
| `GET /api/health`, `GET /api/health/stream`, `POST /api/health/upload` | §8 above |
| `GET /api/chats` | summaries sorted per §11.3 |
| `POST /api/chats` | `readJsonBody`; `z.strictObject({ id: ChatIdSchema })`; `createChat`; `broadcastChat`; 201 `{ chat }` |
| `GET /api/chats/:chatId` | invalid id or missing → 404 |
| `GET /api/chats/:chatId/messages` | `URLSearchParams`; unknown params → 400; `since`/`before` must match `ULID_RE`; `tail` must match `^[1-9][0-9]*$` and be ≤ `MAX_TAIL` |
| `POST /api/chats/:chatId/messages` | JSON (`SendInputSchema`) or multipart: `author` exactly once (string), `text` 0–1 times (string), `files` 0–n (`File` instances only), any other field / wrong type / duplicates → 400. `appendMessage` → `broadcastMessage` → `broadcastChat(getSummary)` → 201 `{ message }` |
| `GET /api/chats/:chatId/assets/:assetId` | `assetId` must match `ULID_RE` (else 404); `getAsset` → 200 `{ asset, messageId, available }` or 404 |
| `GET /api/chats/:chatId/validate` | `validateChatFile` on disk → 200; ENOENT → 404 |
| `GET /api/chats/:chatId/stream` | 404 JSON if missing; resume = `Last-Event-ID` if it matches `ULID_RE`, else `?since=` (invalid → 400 **before** opening the stream), else none; `openStream`; `subscribeChat` |
| `GET /api/stream` | `openStream`; `subscribeGlobal` |
| `GET|HEAD /assets/:chatId/:file` | `chatId` matches `CHAT_ID_RE`, `file` matches `ASSET_FILE_RE`, else 404. If the asset ID is in the chat's index but the file is missing → 404 `asset_missing`; not indexed → 404 `not_found` (don't serve files no message refers to). Headers per §9.3 incl. `Content-Length`; stream with `fs.createReadStream` (no body for HEAD). |
| `OPTIONS` on API/asset paths | CORS preflight 204 |
| `GET /lib/constants.js` | that one file, `text/javascript; charset=utf-8`, with CORS |
| `GET /*` | `serveStatic(public/)`; `/` → `index.html` |

**Startup:** read `PORT`, `HOST`, `DATA_DIR`, `CORS_ORIGIN`; `await store.init(DATA_DIR)`; then
`listen(PORT, HOST)` and log `listening on http://HOST:PORT (data: <abs path>)`. If `HOST` isn't
`127.0.0.1`/`::1`/`localhost`, log `WARN no authentication — anyone who can reach this server can read and post`.
`public/` and `lib/` resolve relative to `server.js` (`new URL('.', import.meta.url)`); `DATA_DIR` relative
to `process.cwd()`.

**Shutdown** on `SIGINT`/`SIGTERM`: `server.close()`, `sse.closeAll()`, `await store.drain()`, exit 0. A
second signal exits immediately.

## 10. Edge cases you must handle

- Restart: kill the server mid-traffic, start it again → all chats load, clients replay via `Last-Event-ID`
  with no gaps or duplicates, new IDs are greater than every existing ID even if the clock went backwards.
- Concurrent POSTs to one chat → all succeed, strictly increasing IDs, never interleaved lines.
- Failure mid-write (disk full, permission) → no message line, no leftover assets, later writes still work,
  `/api/health` reports `writable: false`.
- Client disconnects mid-upload → no partial assets, no crash, no unhandled rejection.
- Trailing partial line on startup → recovered (§7.4). Corrupt middle line → skipped, logged.
- Asset file deleted while the server runs → `/assets/...` returns 404 `asset_missing`; metadata endpoint
  returns `available: false`; nothing else breaks.
- Text referencing an unknown `asset:<ULID>` → accepted and stored.
- `asset:$3` with 2 files → 400. Whitespace-only text without files → 400.
- Traversal attempts (`/assets/x/..%2f..%2fetc%2fpasswd`, `/..%2fserver.js`, absolute paths) → 404.
- Browser on another origin (CORS) can call the API, open SSE, upload, and load `/lib/constants.js`.
- Health probe file is always removed, even when a check fails.

## 11. Manual verification the owner will run (make sure these work; don't script them)

```bash
npm start
curl -s localhost:3000/api/health
curl -N localhost:3000/api/health/stream                  # n:1 now, n:2 a second later
curl -s -XPOST localhost:3000/api/chats -H 'content-type: application/json' -d '{"id":"general"}'
curl -s -XPOST localhost:3000/api/chats/general/messages -H 'content-type: application/json' \
  -d '{"author":"anubhav","text":"hello @claude"}'
curl -s -XPOST localhost:3000/api/chats/general/messages -F author=claude \
  -F 'text=here you go asset:$1' -F files=@./some.png
curl -s 'localhost:3000/api/chats/general/messages?tail=10'
curl -N 'localhost:3000/api/chats/general/stream?since=00000000000000000000000000'
curl -s localhost:3000/api/chats/general/validate
cat data/chats/general.jsonl
# restart: Ctrl-C, npm start again, repeat the reads
```

## 12. Deliverable

Reply with: files created, how to run, any deviations recorded in DESIGN §18, and anything you were unsure
about. Keep it short.
