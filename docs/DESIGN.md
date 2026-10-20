# Agentic Chat — Design (Source of Truth)

Status: v1 draft · Last updated: 2026-10-20

This document is the single source of truth for the server, CLI and web UI. All three implementation
prompts (`docs/prompts/*.md`) defer to it. If an implementation needs to deviate from anything here,
do **not** silently change the contract — add an entry to §18 "Open issues" and flag it.

---

## 1. Overview

A deliberately simple chat application where **humans** (via a web UI) and **independent AI agents**
(Claude, Codex, OpenCode, … via a CLI) talk in shared chat rooms.

- No database. Each chat is a **JSONL file**: one message per line.
- Files/images ("assets") are stored on disk in an **assets folder** and **referenced from messages**.
- **Live updates** via Server-Sent Events (SSE).
- Up to ~10 concurrent participants. Scalability is explicitly a non-goal.

### Goals
1. Files on disk are the database and are always in a valid, strictly defined format.
2. One process (the server) is the **only writer**. Web and CLI are clients of its HTTP API.
3. The CLI is designed to be driven by AI agents: machine-readable JSON/JSONL output, strict validation,
   predictable exit codes, and commands that terminate (so agents with blocking shell tools can use them).
4. Zero build step. Plain JavaScript everywhere.
5. The server survives restarts with no data loss: everything is rebuilt from disk on startup (§7.4).
6. The server may run **remotely**. The CLI can point at any server URL (§5.2); the web UI is served by the
   chat server itself and always talks to that same origin (§5.3).
7. Missing asset files never break anything: they degrade to an "unavailable" placeholder (§9.4).

### Non-goals (v1)
- Authentication, authorization, logins. Identity is just a name.
- Editing or deleting messages. Files are append-only.
- Typing/thinking indicators, token streaming, reactions, threads.
- Loop guards / hop limits between agents (agents are instructed out-of-band).
- Horizontal scaling, multiple server processes, hand-editing chat files while the server runs.
- Running or spawning agents. Agents are external programs that call the CLI.

---

## 2. Architecture

```
 Browser (humans) ──POST /api/chats/:id/messages──▶ ┌──────────────┐ ──append──▶ data/chats/<chatId>.jsonl
                  ◀──SSE /api/chats/:id/stream───── │   server.js  │ ──write───▶ data/assets/<chatId>/<file>
                  ◀──SSE /api/stream (chat list)─── │  (only writer)│
 CLI (agents) ────POST /api/chats/:id/messages───▶ │              │
              ◀───SSE /api/chats/:id/stream──────── └──────────────┘
```

- The server keeps an in-memory cache of every chat it has loaded. Because it is the only writer,
  the cache is authoritative after initial load.
- The CLI never touches `data/` directly. `chat validate` asks the server to validate
  (`GET /api/chats/:chatId/validate`); only `chat validate --local` reads a file from local disk (read-only),
  for use on the server host.
- Server, CLI and browser may be on different machines. The web UI is always served by the chat server and
  talks only to it (same origin, §5.3).

### 2.1 Contract map
Every contract between components is defined **once**, in the section listed. Prompts reference these
sections and must not redefine them. Changing a contract means editing that section (and §18).

| # | Contract | Defined in | Producer | Consumers |
|---|---|---|---|---|
| C1 | Identifier formats (chat ID, author, ULID, asset file) | §6 | server | CLI, web |
| C2 | Chat file on disk (JSONL rules, recovery) | §7 | server (`store.js`) | server load, `lib/validate.js` |
| C3 | Message + Asset object | §8 | server | CLI, web, chat file |
| C4 | Asset storage, naming, serving, unavailability | §9 | server | CLI `asset`, web |
| C5 | Text conventions (`asset:<id>`, `@name`, `asset:$N`) | §10 | CLI/web (write), server (resolve) | web (render), CLI `watch --mention` |
| C6 | Error body + codes (HTTP and CLI) | §11.1, §14.2 | server, CLI | CLI, web, agents |
| C7 | ChatSummary object | §11.2 | server | CLI, web |
| C8 | HTTP endpoints: requests, responses, status codes | §11.3–§11.5 | server | CLI, web |
| C9 | Health endpoints + client diagnosis | §11.6 | server | CLI `health`, web Connection panel |
| C10 | SSE events (`message`, `chat`, `probe`), resume rules | §12 | server | CLI `watch`/`health`, web |
| C11 | Shared library API (`lib/*`) | §13 | server task | server, CLI, web (`constants.js` only) |
| C12 | Validation report (`Problem`) | §13.4 | `lib/validate.js` | server endpoint, CLI `validate` |
| C13 | CLI commands, stdout shapes, exit codes | §14 | CLI | AI agents (and the future agent skill) |
| C14 | Configuration (env, CLI config file, web settings) | §5 | — | server, CLI, web |
| C15 | Limits | §16 (`LIMITS`) | `lib/constants.js`, served via health | server, CLI, web |

---

## 3. Tech stack & conventions

| Item | Decision |
|---|---|
| Runtime | Node.js **>= 22** |
| Language | Plain JavaScript, **ES modules** (`"type": "module"`). **No TypeScript**, no `.ts` files, no JSDoc-typed TS tricks, no build step. |
| Dependencies | **`zod` (^4) only**, used in `lib/schema.js`. Everything else uses Node built-ins (`node:http`, `node:fs/promises`, `node:path`, `node:util` `parseArgs`, global `fetch`, `Request`, `FormData`, `fs.openAsBlob`). |
| Web UI | Static `index.html` + `style.css` + ES-module JS. No framework, no bundler, no CDN. |
| Style | 2-space indent, single quotes, semicolons, `camelCase` functions, `UPPER_SNAKE` constants. Small focused modules. Comments only where intent is non-obvious. |
| Dates | Stored as ISO 8601 UTC with milliseconds (`2026-10-20T10:15:00.000Z`). UI shows 24-hour local time and ISO dates (`YYYY-MM-DD`). |
| Text encoding | UTF-8 everywhere. |
| Tests / Docker | **Do not** write automated tests, test scripts, or Docker files. The owner verifies manually. |
| Git | Do not commit. Do not create branches or worktrees. Edit in place; the owner reviews and commits. |

---

## 4. Repository layout & ownership

```
package.json            # name "agentic-chat", "type": "module", bin { "chat": "bin/chat.js" }, dep zod
.gitignore              # must include node_modules/ and data/
server.js               # entry point: HTTP server               [SERVER]
server/                 # server internals                        [SERVER]
  router.js             #   tiny method+path router
  store.js              #   file store: load, cache, append, per-chat write queue
  sse.js                #   SSE hub: subscribers, broadcast, heartbeat
  http-utils.js         #   JSON responses, errors, body limits, CORS, static file serving
  health.js             #   /api/health, /api/health/stream, /api/health/upload
lib/                    # SHARED, used by server + CLI (+ web for constants.js)   [SERVER builds first]
  constants.js          #   zero-dependency, browser-safe: regexes, limits, mime map, text helpers
  ulid.js               #   zero-dependency monotonic ULID
  schema.js             #   zod schemas, line parse/serialize (Node only)
  validate.js           #   chat-file validator (Node only), used by server endpoint + `chat validate --local`
bin/
  chat.js               # CLI entry (#!/usr/bin/env node)          [CLI]
cli/                    # CLI internals                             [CLI]
  args.js  config.js  api.js  sse-client.js  output.js  errors.js  commands/*.js
public/                 # web UI                                    [WEB]
  index.html  style.css  app.js  config.js  api.js  streams.js  health.js  render.js  composer.js  state.js
docs/
  DESIGN.md             # this file
  prompts/server.md  prompts/cli.md  prompts/web.md
data/                   # runtime data, git-ignored, created by the server on start
```

**Build order:** server task first (it owns `lib/`, `package.json`, `.gitignore`), then CLI and web in
parallel. CLI and web must import shared code from `lib/` and must not fork or re-implement it. If a
shared helper is missing, add it to `lib/` following §13 and record it in §18.

---

## 5. Configuration

### 5.1 Server (environment variables only)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `HOST` | `127.0.0.1` | Listen address. Set `0.0.0.0` when the server runs remotely / on a LAN. |
| `DATA_DIR` | `./data` (relative to CWD) | Root of chats + assets |
| `CORS_ORIGIN` | `''` (same-origin only) | Comma-separated allowlist of exact origins (e.g. `http://localhost:5173,https://ui.example.internal`) allowed to call `/api/*`, `/assets/*`, `/lib/constants.js` cross-origin. The server echoes the request `Origin` only if listed. `*` is accepted but logs a startup warning (any website the user visits could then read chats). |
| `ALLOWED_HOSTS` | loopback names when `HOST` is loopback, else unset (no check) | Comma-separated `Host` header values (hostname, optional `:port`) the server answers. Others → `421`. Blocks DNS-rebinding attacks against a local server. |

> ⚠️ **Remote deployment risk:** v1 has no auth. Anyone who can reach the server can read every chat and
> post as any name. When running remotely, keep it on a private network/VPN or behind a reverse proxy with
> access control and HTTPS. The server logs a warning at startup when `HOST` is not loopback.

### 5.2 CLI — server URL and default author
Resolution order (first wins):

| Setting | 1. flag | 2. env | 3. config file | 4. default |
|---|---|---|---|---|
| Server URL | `--url` | `CHAT_URL` | `url` | `http://localhost:3000` |
| Author | `--as` | `CHAT_AUTHOR` | `author` | — (required for `send`) |

Config file: `$XDG_CONFIG_HOME/agentic-chat/config.json` (default `~/.config/agentic-chat/config.json`),
strict JSON `{"url":"https://chat.example.internal","author":"claude"}` (both keys optional, no others).
Managed with `chat config get|set|unset <key> [value]`. The config file is useful for agents whose shell
environment doesn't persist env vars between calls.

The URL may include a path prefix (e.g. `https://host/chat`) for reverse-proxy setups. All clients build
URLs relative to it (`new URL('api/chats', base.endsWith('/') ? base : base + '/')`), never from `/`.

### 5.3 Web UI — same origin only
- The web UI is always served by the chat server it talks to (same instance). **No server-URL setting, no
  `?server=` parameter.** Every request uses a URL relative to the page (`api/...`, `assets/...`), so the UI
  works at `/` and behind a reverse-proxy path prefix alike.
- All UI code, including `lib/constants.js`, is loaded with static relative imports from that same origin.
  HTML responses carry a CSP with `script-src 'self'` (§11.3).
- Consequently the web UI needs no CORS. `CORS_ORIGIN` stays fail-closed by default and is only for
  development setups (e.g. a UI dev server on another port).

---

## 6. Identifiers

| Thing | Format | Regex (exported from `lib/constants.js`) | Example |
|---|---|---|---|
| Chat ID | lowercase slug, 1–64 chars, chosen by creator | `CHAT_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/` | `design-review` |
| Author name | lowercase, 1–32 chars | `AUTHOR_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/` | `claude`, `anubhav`, `codex-2` |
| Message ID | ULID, 26 chars Crockford base32, uppercase | `ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/` | `01M5CCX98VQ2X7F4M8N6P0R5T1` |
| Asset ID | ULID (same format) | `ULID_RE` | |
| Asset file name | `<assetId><ext>`, ext optional | `ASSET_FILE_RE = /^[0-9A-HJKMNP-TV-Z]{26}(\.[a-z0-9]{1,10})?$/` | `01M5CCX98VQ2X7F4M8N6P0R5T0.png` |

- ULIDs are generated **only by the server**, inside the per-chat write queue, using a **monotonic**
  generator. Therefore message IDs in a chat file are **strictly increasing** in lexical order, and
  lexical comparison of IDs equals chronological order. `since`/`before` use plain string comparison.
- **Across restarts:** the in-process monotonic state is lost on restart, and the clock may have moved
  backwards (NTP, VM migration). So the server always generates a new message ID with a **floor**: it must
  be greater than the chat's last message ID. `ulid({ after })` handles this (§13.2). `ts` is always derived
  from the ID, so it is monotonic too.
- `00000000000000000000000000` (26 zeros) is a valid ULID and is the "beginning of time" sentinel.
- Names are case-sensitive in storage but the format only permits lowercase; UIs lowercase input.

---

## 7. Data on disk

```
data/
  chats/
    <chatId>.jsonl
    <chatId>.jsonl.partial-<epochMs>    # only created by crash recovery (§7.4)
  assets/
    <chatId>/
      <assetId><ext>
```

### 7.1 JSONL rules (the "perfect format")
1. UTF-8, no BOM.
2. Exactly one JSON object per line; each line ends with a single `\n` (LF). The file ends with `\n`
   unless it is empty.
3. No blank lines, no comments, no trailing whitespace outside the JSON.
4. Every line validates against `MessageSchema` (§8) **and** is byte-identical to
   `serializeMessage(parsed)` (canonical key order, `JSON.stringify` with no spacing).
5. `chatId` in every line equals the file's base name.
6. Message IDs are unique and strictly increasing from top to bottom.
7. An empty file (0 bytes) is a valid chat with zero messages.

Asset files being present on disk is **not** a format rule — see §9.4. Missing assets are reported as
warnings, never as format errors.

### 7.2 A chat exists iff its file exists
- Creating a chat = creating an empty `data/chats/<chatId>.jsonl` with exclusive flag (`wx`).
- No metadata line, no index file. Chat list = directory listing of `*.jsonl` with a valid chat ID.

### 7.3 Write path (server only)
All writes to one chat are serialized through a per-chat promise queue:
1. Validate the request input (author, text, files, limits).
2. Inside the queue: generate asset IDs and then the message ID with `ulid({ after: lastIdInChat })`;
   `ts` = ISO string of the message ID's timestamp component.
3. Write each asset to `data/assets/<chatId>/.tmp-<assetId>`, then `rename` to its final name.
4. Resolve `asset:$N` placeholders in text (§10.3), build the message object, validate with
   `MessageSchema`.
5. `appendFile(chatPath, serializeMessage(msg) + '\n')`.
6. On any failure in steps 3–5: delete any asset files written for this message, reject the request.
7. On success: push to the in-memory cache, broadcast via SSE, respond `201`.

### 7.4 Startup, restart & recovery (server only)
The server holds no state that isn't on disk, so a restart (deploy, crash, `--watch` reload) is just
"load everything again". On **every start**, before accepting connections:

1. `mkdir -p` `chats/` and `assets/`.
2. **Remove leftover temp files:** delete every `data/assets/*/.tmp-*` (an upload interrupted by the
   previous process). Log how many.
3. **Eagerly load every chat** (`chats/*.jsonl` with a valid chat ID), sequentially, into the in-memory
   cache. For each file:
   - If non-empty and **not** ending with `\n`, the trailing partial line is from a crash mid-append. Move
     that partial content to `<chatId>.jsonl.partial-<epochMs>`, truncate the chat file to just after the
     last `\n`, log a warning. (Partial files are not chats — they don't match `*.jsonl`.)
   - Parse each line with `parseMessageLine`; additionally require `chatId` = file name and `id` > previous
     valid id. Invalid lines are **skipped** and logged with line numbers; they stay in the file for
     `chat validate` to report. The server never rewrites existing lines.
   - Build the chat's **asset index**: `Map<assetId, { asset, messageId }>` from all valid messages.
   - Check every indexed asset file exists (`stat`); log missing ones as warnings (§9.4). Do not fail.
4. Log a one-line summary per chat and a total:
   `loaded 3 chats, 1,204 messages, 2 invalid lines skipped, 1 missing asset, 0 partial lines recovered`.
5. Start listening.

Consequences:
- Startup cost is reading all chat files once. At this scale (≤10 users) that's milliseconds to seconds.
  If a single file fails to load (e.g. permission error), log an error, skip that chat, keep starting.
- **Clients reconnect transparently.** Browsers' `EventSource` and the CLI `watch` reconnect with
  `Last-Event-ID`; since the cache is rebuilt from disk, the server replays exactly what they missed.
  Nothing is lost because a message is only acknowledged (201 + broadcast) after its line is appended.
- A POST that was in flight when the server died either got its line fully appended (and will be served
  after restart) or didn't (client got a network error and may retry). A crash between asset write and
  line append leaves orphan asset files with no message — harmless, not cleaned up in v1.
- After load, the cache is authoritative. Hand edits while the server runs are unsupported; edit with the
  server stopped, then restart.

---

## 8. Message schema

One line = one message. Keys appear in **exactly this order** (canonical serialization):

```json
{"id":"01M5CCX98VQ2X7F4M8N6P0R5T1","chatId":"design-review","ts":"2026-10-20T10:15:00.123Z","author":"claude","text":"Here is the mockup asset:01M5CCX98VQ2X7F4M8N6P0R5T0 — thoughts @anubhav?","assets":[{"id":"01M5CCX98VQ2X7F4M8N6P0R5T0","file":"01M5CCX98VQ2X7F4M8N6P0R5T0.png","name":"mockup.png","mime":"image/png","size":48213}]}
```

| Field | Type | Rules |
|---|---|---|
| `id` | string | ULID. Set by server. |
| `chatId` | string | Matches `CHAT_ID_RE`; equals file name. |
| `ts` | string | ISO 8601 UTC with ms, regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`. Must equal `new Date(ulidTime(id)).toISOString()`. Set by server. |
| `author` | string | Matches `AUTHOR_RE`. |
| `text` | string | 0–`MAX_TEXT_CHARS` chars. LF newlines only (no `\r`). No C0 control chars except `\t` and `\n`, no `\u007F`. May be empty **only if** `assets` is non-empty (whitespace-only counts as empty). |
| `assets` | array | 0–`MAX_ASSETS_PER_MESSAGE` items of Asset. Asset IDs unique within the message. |

**Asset object** (keys in this order):

| Field | Type | Rules |
|---|---|---|
| `id` | string | ULID. Strictly less than the containing message's `id` (assets are created first, §7.3). |
| `file` | string | Exactly `id + extOf(name)`; matches `ASSET_FILE_RE`. |
| `name` | string | Original file name, already sanitized: must equal `sanitizeAssetName(name)` (§9.2), 1–`MAX_ASSET_NAME_CHARS` chars. |
| `mime` | string | Lowercase, `^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$`. |
| `size` | integer | Bytes, `0 ≤ size ≤ MAX_ASSET_BYTES`. |

**Cross-field rules:**
- `asset:<ULID>` references in `text` may point to an asset of **this message or any earlier message in
  the same chat** (e.g. an agent saying "the diagram in asset:01J… is outdated"). References are only
  format-checked, never existence-checked — a reference to an unknown or missing asset is valid data and is
  rendered as "unavailable" (§9.4).
- Assets do **not** have to be referenced in text — unreferenced assets are plain attachments.
- No unknown keys anywhere (strict objects).

---

## 9. Assets

### 9.1 Storage
`data/assets/<chatId>/<assetId><ext>`. Assets belong to exactly one chat. Never deduplicated.

### 9.2 Name, extension, mime (server decides; CLI mirrors for local validation)
- **name**: take the uploaded filename's basename, remove `/`, `\` and control chars, trim, cut to
  `MAX_ASSET_NAME_CHARS`. If empty → `file`.
- **ext**: from `name`, lowercased last `.xxx`; kept only if it matches `^\.[a-z0-9]{1,10}$`, else none.
- **mime**: the part's declared type if it is valid (per §8) and not `application/octet-stream`;
  otherwise `mimeForExt(ext)`; otherwise `application/octet-stream`.

### 9.3 Serving
`GET /assets/<chatId>/<file>` — see §11. Security rules:
- Validate `chatId` and `file` against their regexes **before** touching the filesystem (no traversal).
- `Content-Type` from `mimeForExt(ext)` (fallback `application/octet-stream`).
- `X-Content-Type-Options: nosniff` always.
- `Content-Disposition: inline` only for `INLINE_IMAGE_EXTS` (`.png .jpg .jpeg .gif .webp`).
  Everything else (including `.svg`, `.html`, `.pdf`) is served as `attachment` to avoid XSS.
- `Cache-Control: public, max-age=31536000, immutable` (assets never change).
- `HEAD` is supported (same headers, no body) so clients can probe availability cheaply.

### 9.4 Missing / unavailable assets
An asset can be unavailable for several reasons: its file was deleted or never fully written, the text
references an asset ID that doesn't exist in the chat (typo, other chat, hand edit), or the network fails
mid-download. **This is normal and must degrade gracefully everywhere:**

| Where | Behavior |
|---|---|
| Server load | Warn in logs (`WARN chat=<id> asset=<assetId> file missing`). Message still loaded and served unchanged. |
| `GET /assets/...` | `404` JSON `{"error":{"code":"asset_missing", ...}}` if the asset is indexed but the file is gone; `404 not_found` if unknown. |
| `GET /api/chats/:chatId/assets/:assetId` | Metadata lookup (§11.3) with `"available": true|false`. |
| Message schema | Unaffected. Stored messages are never modified to mark assets missing. |
| Web UI | Attachment or inline ref renders an "unavailable" chip (icon + original name + size if known + "file not available"). `<img>` load errors swap to the same chip. Never a broken image, never an exception. Unknown ref IDs render as `asset:<id> (unavailable)`. |
| CLI `read` / `watch` | Unaffected — they print messages, not files. |
| CLI `asset` | Exit 4 with `code: "asset_missing"` (indexed, file gone) or `not_found` (unknown id). |
| `chat validate` | Reports `asset_missing` / `asset_size_mismatch` as `level: "warning"`. Warnings alone → exit 0. |

---

## 10. Text conventions

All helpers live in `lib/constants.js` (browser-safe). Always use the helpers, never ad-hoc regexes.

### 10.1 Asset references
`asset:<ULID>` inside `text`, e.g. `see asset:01M5CCX98VQ2X7F4M8N6P0R5T0`.
Pattern: `(?<![\w:])asset:([0-9A-HJKMNP-TV-Z]{26})(?![0-9A-Za-z])`.
Renderers replace the token with the asset (image inline, else a download chip). Resolution order:
this message's `assets` → the client's index of already-loaded messages → `GET
/api/chats/:chatId/assets/:assetId` → "unavailable" chip (§9.4).

### 10.2 Mentions
`@name` where name matches the author format. Pattern: `(?<![\w@])@([a-z0-9][a-z0-9_-]{0,31})`.
Mentions are a **convention only** — not stored separately, not validated against known users. Used by
the web UI for highlighting and by `chat watch --mention`.

### 10.3 Placeholders (send-time only, never stored)
When sending, the client does not know asset IDs yet. Text may contain `asset:$N`, where N is the
1-based index of the attached file in upload order. Pattern: `asset:\$([1-9][0-9]?)(?![0-9])`.
The server replaces each placeholder with `asset:<assetId>` of the Nth file. N greater than the number
of attached files → `400 validation_failed`. Stored text never contains placeholders.

---

## 11. HTTP API

Base: `http://HOST:PORT`. All `/api/*` responses are JSON (`application/json; charset=utf-8`) except SSE.

### 11.1 Errors
Every error response (and every CLI stderr error) has this shape:

```json
{"error":{"code":"validation_failed","message":"author: must match ^[a-z0-9][a-z0-9_-]{0,31}$"}}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `bad_request` | Malformed JSON, malformed multipart, bad query params, unknown fields |
| 400 | `validation_failed` | Schema/rule violations |
| 404 | `not_found` | Unknown chat, asset, or route |
| 404 | `asset_missing` | Asset is referenced by a message but its file is not on disk |
| 405 | `method_not_allowed` | Known path, wrong method |
| 409 | `conflict` | Chat already exists |
| 413 | `payload_too_large` | Body/asset/count limits exceeded |
| 415 | `unsupported_media_type` | Wrong `Content-Type` for the route |
| 403 | `forbidden_origin` | Cross-origin POST / preflight from an origin not in `CORS_ORIGIN` (§11.5) |
| 421 | `misdirected_request` | `Host` header not in `ALLOWED_HOSTS` (§11.5) |
| 500 | `internal_error` | Anything else (message must not leak stack traces) |
| 503 | (health body, not an error body) | `GET /api/health` when a check fails (§11.6) |

Path parameters: a `:chatId`, `:assetId` or `:file` that fails its regex is treated as **not found (404)**,
never 400, on every route. Query parameters that fail validation are `400 bad_request`.
`message` is human-readable and may change; clients branch on `code` only.

### 11.2 Chat summary object
```json
{"id":"design-review","messageCount":42,"lastMessageAt":"2026-10-20T10:15:00.123Z"}
```
`lastMessageAt` is `null` for an empty chat. Keys in this order.

### 11.3 Endpoints

**`GET /api/health`**, **`GET /api/health/stream`**, **`POST /api/health/upload`** — see §11.6.

**`GET /api/chats`** → `200 {"chats":[ChatSummary...]}`, sorted by `lastMessageAt` desc, empty chats
last, ties by `id` asc.

**`POST /api/chats`** — body `application/json` `{"id":"<chatId>"}` (no other keys).
→ `201 {"chat":ChatSummary}` · `400` invalid id · `409` exists · `415` not JSON.
Broadcasts a `chat` event on the global stream.

**`GET /api/chats/:chatId`** → `200 {"chat":ChatSummary}` · `404`.

**`GET /api/chats/:chatId/messages?since=&before=&tail=`**
- `since` (ULID, exclusive): only messages with `id > since`.
- `before` (ULID, exclusive): only messages with `id < before`.
- `tail` (int 1–`MAX_TAIL`): after applying since/before, return only the **last** `tail` messages.
- No params → all messages.
- → `200 {"messages":[Message...],"hasMore":bool}` in ascending order. `hasMore` is true iff `tail`
  cut off older matching messages.
- `400` invalid params · `404` unknown chat.

**`POST /api/chats/:chatId/messages`** — two accepted body types:
- `application/json`: `{"author":"...","text":"..."}` (no other keys, no assets).
- `multipart/form-data`: field `author` (exactly once), field `text` (0 or 1 times; missing = `""`),
  file parts named `files` (0–`MAX_ASSETS_PER_MESSAGE`). Any other field name → `400`.
- Server normalizes `\r\n` and lone `\r` to `\n` in text, resolves placeholders, validates, writes (§7.3).
- → `201 {"message":Message}` · `400` · `404` · `413` · `415`.
- Broadcasts the message on the chat stream and a `chat` event on the global stream.

**`GET /api/chats/:chatId/assets/:assetId`** → `200 {"asset":Asset,"messageId":"<ULID>","available":bool}`
from the asset index (`available` = file exists right now) · `404 not_found` if no message has that asset.

**`GET /api/chats/:chatId/validate`** → `200 {"file":"<chatId>.jsonl","lines":N,"valid":N,"problems":[...]}`
using `lib/validate.js` on the file **as it is on disk** (not the cache). Problem shape in §13.4.
`404` if chat unknown.

**`GET /api/chats/:chatId/stream`** — SSE, see §12. `404` (JSON) if chat unknown.

**`GET /api/stream`** — global SSE for the chat list, see §12.

**`GET|HEAD /assets/:chatId/:file`** → asset bytes (§9.3) · `404 asset_missing` / `404 not_found` (§9.4).

**Static:** `GET /` → `public/index.html`; `GET /<path>` → file under `public/` if it exists;
`GET /lib/constants.js` → `lib/constants.js` (the only `lib/` file exposed). HTML responses include
`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' http: https: data: blob:; connect-src 'self' http: https:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
and `Referrer-Policy: no-referrer`. Path traversal must be
impossible. Unknown non-API paths → `404` plain text.

### 11.4 Body limits
- JSON bodies: max `MAX_JSON_BODY_BYTES`.
- Multipart: max `MAX_ASSETS_PER_MESSAGE * MAX_ASSET_BYTES + MAX_JSON_BODY_BYTES` total, enforced while
  streaming (reject early on `Content-Length`, and abort if the streamed byte count exceeds it). Each
  file additionally ≤ `MAX_ASSET_BYTES`.

### 11.5 Remote access & CORS
- **Fail closed.** By default (`CORS_ORIGIN` empty) only same-origin browser access works. The shipped web UI
  is same-origin (§5.3) and never needs CORS; the allowlist exists for development setups only.
- For a request whose `Origin` is in the allowlist, responses on `/api/*`, `/assets/*` and
  `/lib/constants.js` include `Access-Control-Allow-Origin: <that origin>`, `Vary: Origin`, and
  `Access-Control-Expose-Headers: Content-Length, Content-Disposition`.
- `OPTIONS` preflight → `204` with `Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS`,
  `Access-Control-Allow-Headers: Content-Type, Last-Event-ID`, `Access-Control-Max-Age: 600` **only** for
  allowlisted origins; otherwise `403` with no CORS headers.
- **Cross-site write protection:** any `POST` carrying an `Origin` header that is neither the server's own
  origin nor allowlisted → `403 forbidden_origin`. (Multipart POSTs are "simple" requests that browsers send
  without preflight, so CORS alone doesn't stop a malicious page from posting.) Requests without `Origin`
  (the CLI, curl) are unaffected.
- **Host check:** requests whose `Host` isn't in `ALLOWED_HOSTS` (§5.1) → `421 misdirected_request`.
  Blocks DNS rebinding against a server on `127.0.0.1`.
- These are browser-abuse protections, not auth. Anything that can reach the port directly can still read
  and post (§5.1 warning).
- No cookies/credentials are used anywhere, so `Allow-Credentials` is never sent.
- Behind a reverse proxy: SSE needs response buffering off (the server sends `X-Accel-Buffering: no`) and
  idle timeouts > 15 s (heartbeat interval). The server doesn't need to know its public URL — it never
  emits absolute URLs; clients build them from their configured base.

### 11.6 Health checks
Goal: a client can prove, end to end, that **every path it depends on works** — not just that something
answered on the port. Proxies, VPNs, CORS and firewalls typically break one specific thing (SSE gets
buffered, uploads get cut at 1 MB, preflight is blocked), so each dependency gets its own probe.

**Server-side — `GET /api/health`** (also `HEAD`), never cached (`Cache-Control: no-store`):
```json
{
  "ok": true,
  "protocol": 1,
  "version": "0.1.0",
  "startedAt": "2026-10-20T09:00:00.000Z",
  "uptimeSec": 4512,
  "checks": {
    "dataDir": { "ok": true, "readable": true, "writable": true },
    "store":   { "ok": true, "chats": 3, "messages": 1204, "invalidLines": 2, "missingAssets": 1, "partialRecovered": 0 }
  },
  "limits": { "MAX_TEXT_CHARS": 100000, "MAX_ASSETS_PER_MESSAGE": 10, "MAX_ASSET_BYTES": 26214400, "...": "..." }
}
```
- `dataDir`: on every call, write + read back + delete `data/.health-<ulid>` (proves the disk is
  writable now — full disk, read-only remount, permission changes).
- `store`: counts from the startup load (§7.4) and live cache. `invalidLines`/`missingAssets` are
  informational; they don't make `ok` false.
- `ok` = all checks ok. Any failing check → HTTP **503** with the same body and the failing check's `ok:false`
  plus an `error` string.
- `protocol`: integer bumped on breaking API changes. Clients compare with their own `PROTOCOL_VERSION`
  (in `lib/constants.js`) and warn on mismatch. `limits` lets remote clients validate against the
  server's actual limits.

**SSE path probe — `GET /api/health/stream`**: an SSE response that sends `event: probe` `data: {"n":1}`
immediately, a second `{"n":2}` after 1 s, then closes. A client that receives `n:1` within 2 s and `n:2`
after it proves SSE is not buffered by anything in between. (If both arrive together after the stream
closes, a proxy is buffering → live updates will not work.)

**Upload path probe — `POST /api/health/upload`**: accepts `multipart/form-data` with one `files` part
(≤ `MAX_ASSET_BYTES`), reads and discards it (nothing written to disk), returns
`{"ok":true,"receivedBytes":N}`. Clients send a small probe (64 KB) by default, optionally a larger one, to
detect proxy body-size limits before a real upload fails.

**Client-side diagnosis** (CLI `chat health`, web "Connection" panel) runs these in order and reports each:

| Check | Pass condition | Typical failure it reveals |
|---|---|---|
| `reach` | `GET /api/health` answers, JSON parses | wrong URL, DNS, firewall, server down, TLS error |
| `server` | HTTP 200 and `ok: true` | disk full / read-only, store problems |
| `protocol` | `protocol` equals client's `PROTOCOL_VERSION` | client and server versions differ |
| `sse` | `n:1` within 2 s, `n:2` ≥ 0.8 s later | proxy buffering, SSE blocked |
| `upload` | `receivedBytes` equals bytes sent | proxy body limit, multipart stripped |

Each check reports `{ ok, ms, error? }`. Later checks are skipped (`ok: null`) if `reach` fails.

---

## 12. SSE protocol

Headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`,
`Connection: keep-alive`, `X-Accel-Buffering: no`. First write: `retry: 2000\n\n`.
Heartbeat: comment line `: ping\n\n` every 15 s on every open stream.

### 12.1 Chat stream — `GET /api/chats/:chatId/stream[?since=<ULID>]`
Each message is one event; `data` is **exactly the canonical JSONL line** (`serializeMessage(msg)`):
```
id: 01M5CCX98VQ2X7F4M8N6P0R5T1
event: message
data: {"id":"01M5CCX98VQ2X7F4M8N6P0R5T1","chatId":"design-review",...}

```
- Resume point = `Last-Event-ID` header if present and a valid ULID, else `?since=`, else none.
- If a resume point is given, the server first replays all cached messages with `id > resume point`, then
  streams live. With no resume point, only new messages are streamed.
- Replay and subscriber registration happen synchronously in the same tick (after the chat is loaded)
  so no message can fall into a gap.
- Clients must de-duplicate by `id` (e.g. a message received both as POST response and via SSE).

### 12.2 Global stream — `GET /api/stream`
- On connect: no replay. Clients fetch `GET /api/chats` after the stream opens.
- `event: chat`, `data:` a ChatSummary JSON, sent when a chat is created and after each new message.
- No `id:` field (not resumable; clients re-fetch the list on reconnect).

---

## 13. Shared library contract (`lib/`)

### 13.1 `lib/constants.js` — zero dependencies, runs in Node and browsers
```
CHAT_ID_RE, AUTHOR_RE, ULID_RE, ASSET_FILE_RE, ISO_TS_RE, MIME_RE      // anchored, non-global
ZERO_ULID = '00000000000000000000000000'
PROTOCOL_VERSION = 1
LIMITS = {
  MAX_TEXT_CHARS: 100_000,
  MAX_ASSETS_PER_MESSAGE: 10,
  MAX_ASSET_BYTES: 25 * 1024 * 1024,
  MAX_ASSET_NAME_CHARS: 200,
  MAX_JSON_BODY_BYTES: 1024 * 1024,
  MAX_TAIL: 1000,
}
EXT_MIME            // { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
                    //   '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
                    //   '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
                    //   '.csv': 'text/csv', '.html': 'text/html', '.js': 'text/javascript',
                    //   '.zip': 'application/zip', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', ... }
INLINE_IMAGE_EXTS   // ['.png', '.jpg', '.jpeg', '.gif', '.webp']
FORBIDDEN_CTRL_RE   // /[\u0000-\u0008\u000B-\u001F\u007F]/   (allows \t and \n; \r is also forbidden)

extractAssetRefs(text)    -> string[]    // unique ULIDs in first-appearance order
extractMentions(text)     -> string[]    // unique names in first-appearance order
findPlaceholders(text)    -> number[]    // unique 1-based indices
resolvePlaceholders(text, assetIds) -> { ok: true, text } | { ok: false, error }
normalizeNewlines(text)   -> string      // \r\n and \r -> \n
sanitizeAssetName(name)   -> string      // §9.2
extOf(name)               -> string      // '.png' or ''
mimeForExt(ext)           -> string|null
tokenizeText(text)        -> Array<{type:'text'|'asset'|'mention'|'url', value}>  // for renderers
```
Helpers must create fresh `RegExp` objects (or use `matchAll` with module-private global regexes) so no
`lastIndex` state leaks between calls.

### 13.2 `lib/ulid.js` — zero dependencies
```
ulid({ after } = {})  -> string   // monotonic; result is always > `after` (if given) and > the previous call
ulidTime(id)          -> number   // epoch ms decoded from the first 10 chars
```
Randomness from `globalThis.crypto.getRandomValues`. If `Date.now()` ≤ the time part of the floor
(`after` or the last generated ID), reuse that time part and increment the random part.

### 13.3 `lib/schema.js` — Node only (imports `zod`)
```
ChatIdSchema, AuthorSchema, UlidSchema, AssetSchema, MessageSchema, ChatSummarySchema
SendInputSchema          // { author, text } as received from clients (placeholders allowed in text)
parseMessageLine(line)   -> { ok: true, message } | { ok: false, code: 'invalid_json'|'schema'|'not_canonical', error }
serializeMessage(msg)    -> string   // canonical key order, no trailing newline
serializeChatSummary(c)  -> string
formatZodError(err)      -> string   // "path: message; path: message"
```
All object schemas are strict (unknown keys rejected). `MessageSchema` enforces every rule in §8
including cross-field rules.

### 13.4 `lib/validate.js` — Node only
```
validateChatFile({ chatId, chatPath, assetsDir }) -> { file, lines, valid, problems: Problem[] }
Problem = { line: number | null, level: 'error' | 'warning', code, message }
```
Error codes: `bom`, `invalid_utf8`, `crlf`, `no_final_newline`, `blank_line`, `invalid_json`, `schema`,
`not_canonical`, `chat_id_mismatch`, `id_order`, `duplicate_id`.
Warning codes: `asset_missing`, `asset_size_mismatch`, `partial_file_present` (a `.partial-*` sibling exists).

---

## 14. CLI contract (summary — full detail in `docs/prompts/cli.md`)

```
chat list
chat create   <chatId>
chat info     <chatId>
chat read     <chatId> [--tail N] [--since ULID] [--before ULID]
chat send     <chatId> --as <name> (<text> | - | --text-file <path>) [--attach <file>]...
chat watch    <chatId> [--since ULID] [--count N] [--timeout SECONDS] [--ignore <name>]... [--mention <name>]
chat asset    <chatId> <assetId> [-o <path>] [--force]
chat validate <chatId>                                    # server-side validation (works remotely)
chat validate --local <chatId | path.jsonl> [--data-dir <dir>]   # read-only, on the server host
chat config   get [key] | set <key> <value> | unset <key>          # keys: url, author
chat health   [--upload-bytes N]                          # end-to-end connection check (§11.6)
Global: --url <baseUrl>, --help, --version
```
Server URL / author resolution: §5.2.

**Output contract:** every line on **stdout** is one JSON object (JSONL). Messages are printed in canonical
serialization. Nothing else is ever printed to stdout (sole exception: `--help` prints plain text). Errors go
to **stderr** as one JSON line in the §11.1 shape. The CLI validates everything it sends and everything it
receives; invalid data from the server is an error, never passed through.

### 14.1 stdout shapes per command

| Command | stdout (each row = one JSON line) |
|---|---|
| `list` | N × ChatSummary (§11.2), server order |
| `create`, `info` | 1 × ChatSummary |
| `read` | N × Message (§8), ascending by `id`; nothing else |
| `send` | 1 × Message (the stored message, placeholders resolved) |
| `watch` | N × Message, in arrival order, deduplicated, after filters |
| `asset` | 1 × `{"asset":Asset,"messageId":"<ULID>","path":"<absolute local path>"}` |
| `validate` | N × `Problem` (§13.4), then 1 × `{"file":"...","lines":N,"valid":N,"errors":N,"warnings":N}` |
| `config get` | `{"path":"...","url":...,"author":...}` (whole config) or `{"<key>":value\|null}` |
| `config set`/`unset` | 1 × the resulting config `{"path":"...","url":...,"author":...}` |
| `health` | 1 × `{"url":"...","ok":bool,"server":<health body or null>,"checks":{"reach":Check,"server":Check,"protocol":Check,"sse":Check,"upload":Check}}`, `Check = {"ok":true\|false\|null,"ms":N,"error"?:"..."}` |
| `--version` | 1 × `{"version":"<package version>","protocol":<PROTOCOL_VERSION>}` |

Any command that hits a network error (exit 2) adds `run "chat health" to diagnose` to its error message.

### 14.2 CLI error codes (stderr `error.code`)
Server codes (§11.1) are passed through unchanged. CLI-originated codes:

| `code` | Exit | When |
|---|---|---|
| `usage` | 1 | Bad/missing/unknown flags or arguments |
| `network_error` | 2 | Server unreachable, DNS, TLS, reset, request timeout |
| `server_error` | 2 | 5xx, 503 health failure, or a non-JSON response |
| `invalid_response` | 3 (2 for `asset` size mismatch) | Server data failed schema/canonical/consistency checks |
| `validation_failed` | 3 | Local input invalid (text, attachments, IDs, config file) |
| `file_not_found` | 4 | `--attach`, `--text-file` or `validate --local` path missing |
| `file_exists` | 6 | `asset` output path exists without `--force` |
| `timeout` | 5 | `watch --timeout` elapsed |
| `internal_error` | 2 | Unexpected CLI bug |

### 14.3 Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Usage error (bad flags/arguments) |
| 2 | Network or server error (unreachable, 5xx, protocol error) |
| 3 | Validation error (local input invalid, server 400/413/415, invalid data received, `validate` found errors — warnings alone don't count) |
| 4 | Not found (404 incl. `asset_missing`, missing local file) |
| 5 | Timeout (`watch --timeout` elapsed before `--count` reached) |
| 6 | Conflict (409, or output file exists without `--force`) |

---

## 15. Web UI contract (summary — full detail in `docs/prompts/web.md`)
- Name stored in `localStorage` (`chat.author`), validated with `AUTHOR_RE`.
- Same origin only (§5.3): no server-URL setting; all URLs relative to the page. Shared constants via
  `import * as C from './lib/constants.js'`. Limits come from the health response.
- Sidebar chat list (live via `/api/stream`), create chat, unread markers.
- Thread with history (`tail=200`, "load older" via `before`), live via chat SSE with `since`.
- **Asset upload:** file picker (multiple), drag-and-drop onto the thread/composer, and paste (images from
  clipboard). Pending attachments shown as removable chips (thumbnail for images, name, size) with
  client-side limit checks from `LIMITS`. Sent in one multipart POST together with the text. Upload
  progress bar (via `XMLHttpRequest` `upload.onprogress`; `fetch` has no upload progress). On failure the
  text and attachments stay in the composer for retry.
- Rendering uses `tokenizeText` from `lib/constants.js`; **never** `innerHTML` with server data.
- Missing assets render as "unavailable" chips (§9.4).
- Connection indicator (connected / reconnecting / offline). Survives server restarts by reconnecting.
- **Health:** runs the §11.6 client-side diagnosis on load. Clicking the
  connection indicator opens a "Connection" panel with each check's result and a "Re-test" button. If a
  check fails, the indicator turns amber/red with a short hint (e.g. "Live updates blocked — a proxy is
  buffering SSE").

---

## 16. Limits (single source: `LIMITS` in `lib/constants.js`)
Text 100,000 chars · 10 assets/message · 25 MB/asset · asset name 200 chars · JSON body 1 MB ·
`tail` ≤ 1000.

---

## 16a. Resilience checklist
| Scenario | Expected behavior |
|---|---|
| Server restarts | All chats reloaded from disk before listening (§7.4); web + CLI streams reconnect and replay via `Last-Event-ID`. |
| Server crashes mid-append | Partial line recovered on next start; no acknowledged message lost. |
| Server crashes mid-upload | `.tmp-*` files deleted on next start. |
| Clock goes backwards | IDs still strictly increase (`ulid({ after })`). |
| Asset file deleted | Message intact; UI shows "unavailable"; `chat asset` exits 4 `asset_missing`. |
| Text references unknown asset | Stored as-is; rendered "unavailable". |
| Corrupt line in chat file | Skipped with a warning; rest of chat works; `chat validate` reports it. |
| Server unreachable (remote) | CLI exits 2 with the URL it tried; web shows "offline" and keeps retrying. |
| Proxy buffers SSE / caps uploads / blocks CORS | Detected by the health diagnosis (§11.6) with a specific hint, before users hit it. |
| Disk full or read-only | `/api/health` returns 503 `dataDir.writable: false`; sends fail with 500. |

---

## 17. Future (explicitly not v1)
Typing/thinking presence events, message edit/delete as append-only event lines, loop guards,
shared-token auth, user roster (`data/users.json`) for @mention autocomplete, agent skill for the CLI.

---

## 18. Open issues / deviations
_Implementers: append here, don't silently diverge._

- 2026-10-20 — **CORS default changed from `*` to fail-closed** (§5.1, §11.5, §11.1) after a security review:
  `*` on an unauthenticated server let any website the user visited read chats from `localhost`, and
  multipart POSTs could be forged cross-site. Added `ALLOWED_HOSTS` (DNS rebinding) and `forbidden_origin`.
  Applied in `server/http-utils.js` (`checkHost`, `checkOrigin`, fail-closed `applyCors`) and `server.js`.

- 2026-10-20 — **Web UI is same-origin only** (owner decision; §5.3, §15): the UI and chat server run on
  the same instance, so the server-URL setting and `?server=` are removed. Supersedes the next entry's
  confirmation step. The CLI remains fully configurable (§5.2).
**Web UI implementation (v0.1.0):**
- §11.6 health diagnosis runs in parallel with loading chats (doesn't block boot); server `limits` apply once
  health returns, `C.LIMITS` until then.
- §13.1 `constants.js` has no `ulidTime`; the UI has a small local decoder for unread markers. Candidate to
  add to `constants.js`.
- §9.4 non-image attachments get one cached `HEAD` each to detect missing files.
- §15 name dialog has a "Later" button (read without a name); Send without a name reopens it.
- A stream not open after 10 s shows "offline" even while the browser retries. `app.js` is ~900 lines.
- "Can't reach the chat server" is static HTML in the boot screen, revealed by CSS after 6 s if `app.js`
  never runs; its Retry is a plain reload link (works without JS, drops the `#` route).
- Known limits: switching chats mid-upload cancels it (draft text kept, attachments dropped); a failed
  inline-asset lookup stays "unavailable" until the chat is reopened; `<dialog>` requires evergreen browsers.

- 2026-10-20 — **Web UI no longer imports code from the configured server** (§5.3, §15, §11.3) after a
  security review: `import()` of `lib/constants.js` from a `?server=` URL let a crafted link run attacker
  JavaScript in the UI's origin (read all chats, post as anyone). Now: static same-origin import, `?server=`
  requires user confirmation, and HTML gets a `script-src 'self'` CSP (applied in `server/http-utils.js`).

**Server implementation (v0.1.0):**
- §9.2 `sanitizeAssetName` strips all control chars incl. `\t`, re-trims after truncation, never splits a
  surrogate pair (keeps `name === sanitizeAssetName(name)` stable). Declared mime is lowercased and
  `;params` dropped before validation.
- §11.1 `bad_request` for structural problems (unknown keys/fields, missing/duplicate `author`, wrong
  types); `validation_failed` for schema-rule violations.
- §7.3 if `appendFile` fails, the chat file is truncated back to its pre-append size.
- §9.4 `/assets/:chatId/:file` requires `file` to equal the indexed asset's `file` (wrong ext → `not_found`);
  unmatched `/assets/*` → JSON 404; non-GET/HEAD on static paths → plain 404 (not 405).
- §12 invalid `Last-Event-ID` is ignored (falls back to `since`); HEAD on SSE routes sends headers and closes.
- §13.4 BOM reported once, then line 1 parsed without it; `crlf` once per line; `invalid_utf8` stops with
  `lines: 0`; file-level problems (`line: null`) sort first.
- §10 `tokenizeText` always trims a trailing `)` from URLs, even balanced ones (Wikipedia-style URLs get cut).
- §11.4 per-file 413 fires after the multipart body is fully parsed (total cap is enforced while streaming).
- Server `requestTimeout` is 10 min for slow large uploads.
- ULID monotonic state is process-wide (IDs increase across all chats, not just per chat).
- A chat that fails to load at startup is skipped; creating it again returns 409 (file still exists).

**CLI implementation (v0.1.0):**
- §14.1 skipped health checks print `{"ok":null,"ms":0}` (cli.md showed no `ms`).
- §14.3 malformed positional IDs / `--as` → exit 3 `validation_failed`; malformed option values
  (`--tail`, `--since`, `--before`, `--count`, `--timeout`, `--ignore`, `--mention`, `--upload-bytes`) → exit 1.
- §12.1 `watch` without `--since` first fetches the chat's last ID (or `ZERO_ULID`) so every connection has a
  resume point; sends it as both `Last-Event-ID` and `?since=`. Observable behavior is still "new messages only".
- Additions: `-v` alias, `chat help <cmd>`, `asset -o <dir>` writes `<dir>/<name>`, `send` also checks asset
  sizes, `config set url` stores the raw value (normalized on read), `health` reports only on stdout (no
  stderr) even when exiting 2.
- Other 4xx (e.g. 405) map to exit 2 with the server's code.
