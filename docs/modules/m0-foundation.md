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
- `Message`: `messageId`, `chatId`, `prevMessageId | null`, `direction ('in'|'out')`, `senderType ('client'|'agent'|'admin')`, `senderId | null`, `type ('text')`, `text`, `waMessageId | null`, `status`, `createdAt`.
- `Chat`: `chatId`, `headMessageId | null`, `assignedTo (userId | 'UNASSIGNED')`, `lastClientMessageAt`, `lastMessageAt`, `lastMessagePreview`, `clientName | null`.
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
| `GET /api/chats?filter=mine\|unassigned\|all` | agent: `mine` only; admin: all | — | `{ chats: ChatSummary[] }` sorted by `lastMessageAt` desc |
| `GET /api/chats/:phone/messages?before=<messageId>&limit=30` | assignee or admin | — | `{ chat, headMessageId, messages: Message[] (newest first), nextBefore \| null }` |
| `POST /api/chats/:phone/messages` | assignee or admin | `{ text }` | `{ message }` (status `pending`) |
| `PUT /api/chats/:phone/assign` | admin | `{ userId }` | `{ chat }` |
| `POST /api/chats/:phone/auto-assign` | admin | — | `{ chat }` |

`ChatSummary` = `Chat` plus `assignee: { userId, name } | null` and `windowOpen: boolean`.

## Done when
- [ ] `npm install` at the root links all workspaces.
- [ ] `npm run lint` passes on the skeleton.
- [ ] Importing `@vartalap/core` from `apps/web` and from `services/whatsapp` works.
- [ ] Schemas and error codes match this file, and this file matches `docs/arch/boilerplate.md`.
