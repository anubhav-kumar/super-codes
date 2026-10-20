# Prompt: Build the Agentic Chat **Web UI**

You are implementing the browser client for "Agentic Chat", used by **humans** to chat with each other and
with AI agents (who use a CLI). The UI is served by the chat server itself and talks only to that
same origin (no configurable server URL).

**Read `docs/DESIGN.md` in full before writing any code. It is the source of truth** (especially §5.3,
§8, §9, §10, §11, §12, §15). Where this prompt and DESIGN.md seem to disagree, DESIGN.md wins — record the
conflict in DESIGN.md §18 "Open issues".

---

## 0. Hard constraints

- **Plain JavaScript ES modules**, plain HTML and CSS. No framework, no bundler, no TypeScript, no CDN, no
  npm packages in the browser.
- Target current evergreen browsers (Chrome, Safari, Firefox). Use modern APIs freely (`EventSource`,
  `fetch`, `FormData`, `URL`, `structuredClone`). Keep CSS flat (no nesting).
- **Never assign server-provided data to `innerHTML`/`outerHTML`/`insertAdjacentHTML`.** Build DOM with
  `document.createElement` + `textContent`. Static template markup in your own code is fine.
- Shared constants/helpers come from `lib/constants.js` via a **static relative import from the page's own
  origin** (see §2) — never `import()` code from a URL. Never copy regexes or
  limits into the UI.
- Do **not** write automated tests or Docker files. Do **not** commit or branch. Do not touch `server.js`,
  `server/`, `lib/`, `bin/`, `cli/`.

## 0.1 Contracts (DESIGN §2.1)

You produce no cross-system contract except what you **send** to the server (C8 request bodies: JSON
`{author,text}` or multipart `author`/`text`/`files`). Everything else you **consume** — code against the
DESIGN sections, not against guesses about the server's code:

| Contract | Section | How you use it |
|---|---|---|
| C1 Identifiers | §6 | Validate name and chat IDs with `C.AUTHOR_RE` / `C.CHAT_ID_RE`; order messages by id string compare |
| C3 Message/Asset | §8 | Field names and meaning for rendering; `asset.file` builds the URL |
| C4 Assets | §9 | URL pattern, inline-vs-download, §9.4 unavailable handling |
| C5 Text conventions | §10 | Render via `C.tokenizeText`; asset ref resolution order (§10.1) |
| C6 Errors | §11.1 | Show `error.message`, branch on `error.code` only |
| C7 ChatSummary | §11.2 | Sidebar items and sort order |
| C8 Endpoints | §11.3–§11.5 | Exact paths, query params (`since`/`before`/`tail`), `hasMore`, relative URLs |
| C9 Health | §11.6 | Connection panel checks and pass conditions |
| C10 SSE | §12 | `message` and `chat` events, `since` + `Last-Event-ID` resume, dedupe by id |
| C11 Shared lib | §13.1 | Only `lib/constants.js`, static import from the page's own origin |
| C14 Config | §5.3 | Same origin only; `chat.author` |
| C15 Limits | §16 | Use `limits` from the health response (fallback `C.LIMITS`) |

The server validates everything authoritatively; your client-side checks exist only to give fast, friendly
errors and must use the same shared helpers.

## 1. What you own

```
public/index.html
public/style.css
public/app.js        # entry: boot, routing, wiring
public/config.js     # author setting (localStorage)
public/api.js        # fetch/XHR wrappers, error mapping
public/streams.js    # EventSource management (global + chat), reconnect state
public/health.js     # §11.6 client-side diagnosis
public/render.js     # message/asset/text rendering (DOM only)
public/composer.js   # textarea, attachments, upload with progress
public/state.js      # in-memory state + tiny pub/sub
```
Keep each module focused; a few hundred lines max each. Comments only where intent isn't obvious.

## 2. Boot (DESIGN §5.3 — same origin only)

1. Base URL = the page's own directory, `new URL('.', location.href)`. Build every URL relative to it
   (`new URL('api/...', base)`, `assets/...`) so a reverse-proxy path prefix works. There is no server-URL
   setting and no `?server=` parameter.
2. Shared code is a static import at the top of the module: `import * as C from './lib/constants.js'`.
   No inline `<script>` blocks or inline event-handler attributes (the server's CSP is `script-src 'self'`).
   If the server is unreachable, show a full-page "Can't reach the chat server" screen with a Retry button
   (`location.reload()`).
3. Run the health diagnosis (§6) alongside loading chats, opening the global stream, and routing.
- Wrap every `localStorage` access in `try/catch`; the UI must work (with defaults) when storage is
  unavailable.

## 3. Identity

- `localStorage['chat.author']`. If missing/invalid, show a modal on first load: "Your name" input,
  lowercased as you type, validated with `C.AUTHOR_RE` (show the rule inline), Save button. Can't send
  without a name (reading works).
- Header shows "posting as **name**" — click to change.

## 4. Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Agentic Chat   ● connected                          posting as anubhav ⚙ │
├──────────────┬───────────────────────────────────────────────────────┤
│ + New chat   │ # general                                              │
│              │ ──────────── 2026-10-20 ────────────                   │
│ # general  • │ claude  10:15                                          │
│ # design     │   Here is the mockup [image]  — thoughts @anubhav?     │
│ # empty-room │ anubhav 10:16                                          │
│              │   looks good                                           │
│              │                                       [↓ 3 new]        │
│              ├───────────────────────────────────────────────────────┤
│              │ [📎] [ textarea ............................ ] [Send] │
│              │ [mockup.png 48 KB ×] [notes.pdf 1.2 MB ×]  ████░ 62%  │
└──────────────┴───────────────────────────────────────────────────────┘
```
- Responsive: under 720 px the sidebar becomes a slide-over toggled from the header. 16 px side gutters, no
  horizontal page scroll; long words/URLs wrap (`overflow-wrap: anywhere`), code blocks scroll horizontally
  inside themselves.
- Light and dark themes via CSS custom properties on `:root` + `@media (prefers-color-scheme: dark)`.
  System font stack. Accessible contrast, visible focus rings, `aria-live="polite"` on the thread for new
  messages, all controls keyboard-reachable, buttons have labels.

## 5. Routing
Hash routes: `#/` (no chat selected → empty state "Pick or create a chat") and `#/chat/<chatId>`. Invalid or
unknown chat ID → empty state with "Chat not found". Browser back/forward works.

## 6. Connection status & health (DESIGN §11.6, §15)
- Header indicator with states: **connected** (green), **reconnecting** (amber), **offline** (red),
  **degraded** (amber, a health check failed but basics work).
- `health.js` runs the diagnosis on boot and on "Re-test":
  1. `reach` — `fetch(api/health)` (10 s timeout via `AbortSignal.timeout`); failure → "server unreachable".
  2. `server` — 200 + `ok:true`; show failing sub-checks (e.g. "Server disk not writable").
  3. `protocol` — equals `C.PROTOCOL_VERSION`; else "Server and UI versions differ — reload".
  4. `sse` — `new EventSource(api/health/stream)`; listen for `probe` events; pass if `n:1` within 2 s and
     `n:2` ≥ 800 ms later; close it after. Failure hint: "Live updates are being buffered by something
     between you and the server (proxy/VPN)".
  5. `upload` — `POST api/health/upload` with a 64 KB `Blob` of random bytes as `files`; pass if
     `receivedBytes` matches. Failure hint: "Uploads are blocked or size-limited between you and the
     server".
- Clicking the indicator opens a **Connection** panel: each check
  with ✓/✗/–, timing, error hint, server version, uptime, and a Re-test button.
- Use the server's `limits` from the health response for all client-side checks (fallback `C.LIMITS`).

## 7. Chat list (sidebar)
- On boot: open `EventSource(api/stream)`; on its `open` event (and every reopen) `GET api/chats` and
  replace the list — this covers reconnects after server restarts.
- `chat` events upsert the summary and re-sort (by `lastMessageAt` desc, empty chats last, then id).
- Unread dot: `localStorage['chat.lastSeen.<chatId>']` = last message id seen while the chat was open and the
  tab visible. Show a dot when the summary's `lastMessageAt` is newer than the time part of that id
  (or never seen and messageCount > 0). Don't mark the open chat unread.
- "+ New chat": inline input in the sidebar, validated with `C.CHAT_ID_RE` (lowercase as you type), Enter to
  create (`POST api/chats`), Esc to cancel. 409 → just navigate to the existing chat. Other errors inline.
- Update `document.title` with the unread count, e.g. `(2) Agentic Chat`.

## 8. Thread
### Loading
- Open chat: `GET api/chats/:id/messages?tail=200` → render. Then
  `new EventSource(api/chats/:id/stream?since=<last id or C.ZERO_ULID>)` — always pass `since` so nothing
  falls in the gap between the fetch and the stream. Native `EventSource` resends `Last-Event-ID`
  automatically on reconnect (server restart included); the server prefers it over `since`.
- Switching chats closes the previous chat stream and aborts in-flight requests for it.
- "Load older" button at the top when `hasMore`: `GET ...?before=<oldest id>&tail=200`, prepend, and
  **preserve scroll position**.
- Keep messages in a `Map` by id + an ordered array. **Dedupe by id** (your own message arrives both in the
  POST response and via SSE). Insert in id order (string compare) — never assume arrival order.
- Maintain a per-chat **asset index** `Map<assetId, { asset, messageId }>` from all loaded messages.

### Rendering a message (`render.js`)
- Header: author name (deterministic color from a hash of the name → HSL hue), time `HH:mm` (24-hour,
  local), `title` = full ISO timestamp. Group consecutive messages by the same author within 5 minutes
  (hide repeated header). Date separators `YYYY-MM-DD` when the local date changes.
- Messages mentioning the current user (`C.extractMentions(text)` includes author) get a subtle highlight.
- **Text pipeline:**
  1. Split fenced code blocks (lines starting with ```` ``` ````, optional language, until a closing
     ```` ``` ```` line; an unclosed fence runs to the end) → `<pre><code>` with `textContent`. A small
     "Copy" button per block (`navigator.clipboard.writeText`).
  2. In remaining text, split inline code spans `` `...` `` (single backticks, no newlines) → `<code>`.
  3. Everything else → `C.tokenizeText(text)`:
     - `text` → text node (container uses `white-space: pre-wrap`).
     - `mention` → `<span class="mention">@name</span>`.
     - `url` → `<a href target="_blank" rel="noopener noreferrer">` — only `http:`/`https:` (tokenizer
       guarantees it; re-check with `new URL`).
     - `asset` → inline asset (below).
  No other markdown in v1.
- **Assets:**
  - Resolution for an `asset:<id>` token: this message's `assets` → chat asset index →
    `GET api/chats/:chatId/assets/:assetId` (cache results incl. 404s, max one request per id) →
    unavailable chip. Show a small placeholder while resolving.
  - URL: `new URL('assets/' + encodeURIComponent(chatId) + '/' + asset.file, base)`.
  - Images (`C.INLINE_IMAGE_EXTS` by `C.extOf(asset.file)`): `<img loading="lazy" alt="{name}">`,
    max 320 px tall in the thread, click opens the full image in a lightbox (Esc/click to close, link
    to open original in a new tab). Reserve space to limit layout shift.
  - Other files: chip with a file icon, name, human size (`1.2 MB`, base 1024), mime, as
    `<a href download="{name}">`.
  - Assets in `assets[]` that the text doesn't reference render as an attachment row under the text.
    Assets referenced inline aren't repeated in the row.
  - **Unavailable (DESIGN §9.4)** — never a broken image or an exception:
    - `<img>` `error` event → replace with the unavailable chip.
    - metadata `available: false` or 404 → unavailable chip.
    - Chip: muted style, broken-file icon, original name and size if known (else `asset:<id>`), text
      "file not available". Not clickable.
- One message failing to render must not break the thread: catch per message and render a minimal
  "couldn't display this message" row with its id.

### Scrolling
- Auto-scroll to bottom on new messages only if the user is within 80 px of the bottom; otherwise show a
  "↓ N new" pill that scrolls down and clears on click or when the user reaches the bottom.
- On opening a chat, scroll to bottom. Update `chat.lastSeen.<chatId>` when the bottom is visible and the
  tab is visible (`document.visibilityState`).

## 9. Composer & uploads (`composer.js`, DESIGN §15)
- Auto-growing `<textarea>` (max ~40% of viewport height). **Enter** sends, **Shift+Enter** newline. Ignore
  Enter while an IME composition is active (`event.isComposing`).
- Draft text saved per chat in `localStorage['chat.draft.<chatId>']` (debounced), restored on open, cleared
  on successful send.
- **Attachments:**
  - 📎 button opens `<input type="file" multiple>`.
  - Drag-and-drop files anywhere over the thread/composer: show a drop overlay; ignore non-file drags.
  - Paste: files from `clipboardData.files` (e.g. screenshots) become attachments; pasted text behaves
    normally. Pasted images with no name get `pasted-<YYYYMMDD-HHmmss>.png`.
  - Pending chips: thumbnail (`URL.createObjectURL`, revoked on remove/send) for images, else file icon;
    name; size; × to remove.
  - Client-side checks with the server's limits: count ≤ `MAX_ASSETS_PER_MESSAGE`, each ≤
    `MAX_ASSET_BYTES`; reject offending files with an inline message naming the file and limit. Empty files
    (0 bytes) are allowed.
- **Send:**
  - Normalize newlines, validate text length / `FORBIDDEN_CTRL_RE` / non-blank-unless-attachments with
    `C` helpers before sending; show inline errors.
  - No attachments → `fetch` POST JSON `{ author, text }`.
  - With attachments → `FormData` (`author`, `text`, each file as `files` with its name) sent via
    **`XMLHttpRequest`** so `xhr.upload.onprogress` drives a progress bar (percentage + "Uploading 3 files,
    12.4 / 20 MB"). Cancel button aborts the upload.
  - While sending: lock the composer (Send, textarea, attachments) so edits can't race the upload; the
    thread stays usable.
  - Success: insert the returned message (dedupe with SSE), clear text/attachments/draft, refocus.
  - Failure: keep text and attachments intact, show the server's `error.message` (or a network hint plus
    "Re-test connection" link), allow retry.
  - Users don't need to type placeholders; attachments simply show as attachments. (Text may still contain
    `asset:<id>` references to earlier assets — they render normally.)

## 10. `api.js` and `streams.js`
- `api.get/post` wrappers: build URLs from base, parse JSON, map non-2xx to `{ status, code, message }`
  using the DESIGN §11.1 error body (fallback to status text). Network failure → `{ code: 'network_error' }`.
- Streams: one global `EventSource`, at most one chat `EventSource`. Track `readyState` and `error`/`open`
  events to drive the indicator: `open` → connected; `error` with `readyState === CONNECTING` →
  reconnecting; `CLOSED` (e.g. server returned 404/500) → offline, and retry by recreating after 5 s
  (re-fetching the chat list / re-validating the open chat). Before recreating a chat stream, use the last
  seen id as `since`.
- When a chat stream message fails to `JSON.parse` or lacks required fields, log a console warning and skip
  it (the server guarantees validity; don't crash).
- When the tab becomes visible again after being hidden > 60 s, re-run a quick `reach` check.

## 11. Edge cases you must handle

- Server restarts → indicator goes amber, then green; no duplicate or missing messages; the chat list
  refreshes.
- UI served under a reverse-proxy path prefix (`https://host/chat/`) → everything works under the prefix.
- Asset file deleted / unknown asset ref / image fails to decode → unavailable chip, rest of the message
  fine.
- Very long messages (100k chars), long unbroken strings, RTL text, emoji → layout intact.
- Messages arriving out of order or duplicated → displayed once, in id order.
- Two tabs open → both live; drafts are per chat (last writer wins, acceptable).
- `localStorage` unavailable (private mode) → still works with defaults, name prompted each load.
- Upload of 10 × 25 MB files shows progress and can be cancelled.

## 12. Manual verification the owner will run (make sure these work; don't script them)

1. `npm start`, open `http://localhost:3000`, set a name, create `general`, send text.
2. In a terminal: `chat send general --as claude 'hi @anubhav asset:$1' --attach img.png` → appears live
   with the image inline and the mention highlighted.
3. Attach via picker, drag-drop and paste (screenshot); watch the progress bar; send.
4. Delete an asset file from `data/assets/general/` and reload → unavailable chip.
5. Restart the server → indicator amber → green; send from CLI during downtime fails, after restart shows up.
6. Open the Connection panel → all checks ✓; stop the server → clear failure hints.
7. Run the server with `HOST=0.0.0.0` and open the UI from another machine on the LAN.

## 13. Deliverable

Reply with: files created, any deviations recorded in DESIGN §18, known limitations, and open questions.
Keep it short.
