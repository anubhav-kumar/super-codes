# M0: Foundation and Contracts

**Phase:** 1 · **Depends on:** — · **Unblocks:** all modules

## Goal
Set up the repository skeleton, plus the shared contracts (data schemas, API shapes and error codes) that let M1–M8 be built in parallel without guessing.

## Scope
- Root `package.json` with npm workspaces: `apps/*`, `services/*`, `packages/*`.
- `.nvmrc` (22), `engines` field, ESLint + Prettier config, `.gitignore`, `.env.example`.
- `packages/core` skeleton:
  - `src/config.js`: reads `AWS_REGION`, `STAGE`, `MESSAGES_TABLE`, `CHATS_TABLE`, `USERS_TABLE` and `OUTBOUND_QUEUE_URL`, and fails fast if any are missing. Local processes fill the table and queue values from SSM first with `loadConfigFromSsm()` (`src/config-loader.js`, added 2026-10-17).
  - `src/db/client.js`: `DynamoDBDocumentClient` singleton (`removeUndefinedValues: true`).
  - `src/errors.js`: `AppError(code, message)` and the error codes below.
  - `src/schemas/`: Zod schemas for `Message`, `Chat` and `User`, plus API request bodies.
  - `src/index.js`: re-exports.
- Empty `apps/web`, `services/whatsapp` and `scripts/` folders, each with its own `package.json`.
- Root scripts: `dev`, `deploy`, `seed`, `lint`, `format` (they can be placeholders until their module lands).

## Contracts

### Data shapes
See `docs/arch/boilerplate.md` section 4 for the table design. The Zod schemas must match it exactly:
- `Message`: `messageId`, `chatId`, `prevMessageId | null`, `direction ('in'|'out')`, `senderType ('client'|'agent'|'admin')`, `senderId | null`, `type ('text')`, `text`, `waMessageId | null` (server only, never returned by the API: F3), `status`, `createdAt`.
- `Chat`: `chatId`, `headMessageId | null`, `assignedTo (userId | 'UNASSIGNED')`, `lastClientMessageAt`, `lastMessageAt`, `lastMessagePreview`, `clientName | null`, `publicId` (F3: `c_` + 26 Crockford base32 chars, random, never changes; optional until backfilled).
- F4 `Chat` fields (all optional): `description`, `descriptionUpdatedAt`, `descriptionUpdatedBy` (userId), `profileVersion` (number, 0 when absent), `tags` (string array, ≤ 10). `Note`: see the F4 rows below.
- `User` (public view, never includes `passwordHash`): `userId`, `email`, `name`, `role ('admin'|'agent')`, `active`.
- Message `status` ranks: `pending` 0 < `sent` 1 < `delivered` 2 < `read` 3. `failed` is terminal and only allowed from `pending` or `sent`.

### Error codes
Error response body: `{ "error": { "code": "<CODE>", "message": "<text>" } }`

| Code | HTTP |
|---|---|
| `VALIDATION` | 400 |
| `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` (e.g. email exists) | 409 |
| `WINDOW_EXPIRED` | 409 |
| `INTERNAL` | 500 |

### API (implemented in M7, consumed by M8)
| Method + path | Who | Request | Response |
|---|---|---|---|
| `POST /api/auth/login` | public | `{ email, password }` | `{ user }`, plus a session cookie |
| `POST /api/auth/logout` | any | — | `204` |
| `GET /api/me` | any | — | `{ user }` |
| `PUT /api/me/password` | any | `{ currentPassword, newPassword }` | `204` |
| `GET /api/users` | admin | — | `{ users: User[] }` |
| `POST /api/users` | admin | `{ email, name, role, password }` | `{ user }` |
| `GET /api/chats?filter=mine\|unassigned\|all` | agent: `mine` only; admin: all | — | `{ chats: ChatView[] }` sorted by `lastMessageAt` desc |
| `GET /api/chats/:id/messages?before=<messageId>&limit=30` | assignee or admin | — | `{ chat: ChatView, headMessageId, messages: MessageView[] (newest first), nextBefore \| null }` |
| `POST /api/chats/:id/messages` | assignee or admin | `{ text }` | `{ message: MessageView }` (status `pending`) |
| `PUT /api/chats/:id/assign` | admin | `{ userId }` | `{ chat: ChatView }` |
| `POST /api/chats/:id/auto-assign` | admin | — | `{ chat: ChatView }` |
| `GET /api/chats?…&tag=<tag>` (F4) | as above | `tag` optional, normalized | as above, filtered to chats with that tag; `400 VALIDATION` for a bad tag |
| `PUT /api/chats/:id/description` (F4) | assignee or admin | `{ description, version }` (`""` clears) | `{ chat: ChatView }`; stale `version` → `409 CONFLICT` with `details.current: { description, profileVersion, descriptionUpdatedAt, descriptionUpdatedBy }` |
| `POST /api/chats/:id/tags` (F4) | assignee or admin | `{ tag }` | `200 { tags }` (idempotent); 11th tag → `409 CONFLICT`; not in catalog while "catalog only" → `400 VALIDATION` |
| `DELETE /api/chats/:id/tags/:tag` (F4) | assignee or admin | — | `200 { tags }` |
| `GET /api/chats/:id/notes?before=<noteId>&limit=20` (F4) | assignee or admin | limit 1–50 | `{ notes: Note[] (newest first), nextBefore \| null }` |
| `POST /api/chats/:id/notes` (F4) | assignee or admin | `{ body }` | `201 { note }` |
| `PATCH /api/chats/:id/notes/:noteId` (F4) | author, within 15 min | `{ body }` | `{ note }`; otherwise `403`; deleted/missing `404` |
| `DELETE /api/chats/:id/notes/:noteId` (F4) | author, or any admin | — | `204` (soft delete) |
| `GET /api/tags` (F4 phase 3) | any signed-in user | — | `{ tags: [{ name, createdAt?, createdBy? }], catalogOnly }` (dates/creator for admins) |
| `POST /api/tags` / `PATCH /api/tags` / `DELETE /api/tags/:name` (F4 phase 3) | admin | `{ name }` / `{ catalogOnly }` / — | `201 { tag }` (`409` if it exists) / `{ catalogOnly }` / `204` |

`ChatSummary` = `Chat` plus `assignee: { userId, name } | null` and `windowOpen: boolean` (internal; never returned as is). F4: in a `ChatSummary`, `descriptionUpdatedBy` is resolved to `{ userId, name } | null` and `tags` is always an array.

`Note` (F4) = `{ noteId, body | null, author: { userId, name }, authorRole, createdAt, editedAt | null, deleted, deletedBy?, deletedAt? }`. No `chatId`. Note bodies, descriptions and tag values never appear in logs, error messages or the outbound queue.

**F3 (hide the client's phone):** `:id` is the chat's opaque `publicId`. Chats and messages leave the API only through the views in core (`toChatView`, `toMessageView`), which use a denylist:
- `ChatView` = `ChatSummary` without `chatId`/`publicId`, plus `id` (= `publicId`), `displayName` (`clientName`, or `Client #XXXX` from the last 4 characters of `publicId`) and `phone` (**admins only**). For agents, a `clientName` with 5 or more digits is returned as `null`. Other chat fields (e.g. F4's) pass through.
- `MessageView` = `Message` without `chatId`, `waMessageId` and `statusRank`. Inbound `messageId`s are ULIDs (never a wamid, which embeds the number).
- An unknown or malformed `:id` (including an old phone URL) gets the same answer as a missing chat: agents `403 FORBIDDEN`, admins `404 NOT_FOUND`. Error `details` never carry `chatId`.

## Done when
- [ ] `npm install` at the root links all workspaces.
- [ ] `npm run lint` passes on the skeleton.
- [ ] Importing `@vartalap/core` from `apps/web` and from `services/whatsapp` works.
- [ ] Schemas and error codes match this file, and this file matches `docs/arch/boilerplate.md`.
