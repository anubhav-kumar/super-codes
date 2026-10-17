# F4: Client Attributes (Description, Notes, Tags)

**Status:** Research · **Depends on:** M0–M8. Works alongside F1 (the client details panel) and F3 (the opaque chat ID) · **Classification:** Confidential, internal design note

## 1. Goal
Agents and admins need shared context about a client that the message history doesn't give them: a short description ("Corporate traveller, prefers aisle seats"), a running log of internal notes ("Promised a callback on 2026-10-20"), and tags (`vip`, `refund-pending`) to sort and filter the chat list. This matters most after a reassignment, when the new agent has to pick up a chat cold.

Who it's for: the assigned agent, who reads and writes, and admins, who read, write and moderate. The client never sees any of it. Nothing in F4 is ever sent to WhatsApp.

## 2. Current state
- **Chats item** (`docs/arch/boilerplate.md` §4.2, `packages/core/src/schemas/chat.js`): `chatId` (E.164 phone), `headMessageId`, `assignedTo`, `lastClientMessageAt`, `lastMessageAt`, `lastMessagePreview` and `clientName`. It has no description, notes or tags.
- **Writes to Chats:**
  - `appendMessage` (`packages/core/src/messages/append.js`, `buildChatUpdate`) uses a transactional `UpdateItem` with `SET` on named attributes only, conditioned on `headMessageId`. New attributes on the item are not overwritten.
  - A `TransactionConflict` with a concurrent write to the same item is retried.
  - `assignChat` and `autoAssign` (`packages/core/src/chats/assign.js`) also only `SET assignedTo`.
- **Access** (`packages/core/src/access.js`): `canView` is true for admins, and for agents only when `chat.assignedTo === user.userId`. Reassignment cuts off the previous agent immediately (M4 rules).
- **Chat list** (`packages/core/src/chats/repo.js`):
  - `mine` and `unassigned` use a Query on GSI `byAssignee`, which has projection `ALL`.
  - `all` is a full Scan. Both page through every result, with no server-side filters beyond the filter tab.
  - `ListChatsQuerySchema` (`schemas/api.js`) accepts only `filter`.
- **API conventions** (M0, M7, `apps/web/lib/api.js`):
  - Error body is `{ error: { code, message, details? } }`, with codes `VALIDATION`/`UNAUTHENTICATED`/`FORBIDDEN`/`NOT_FOUND`/`CONFLICT`/`WINDOW_EXPIRED`/`INTERNAL`.
  - Creates return `201` and deletes return `204`.
  - `loadChatFor` returns `FORBIDDEN` (not `NOT_FOUND`) to agents for a missing chat.
  - `INTERNAL` logs never include request bodies.
- **Infra and config** (`services/whatsapp/serverless.yml`, `packages/core/src/config.js`, `config-loader.js`):
  - Tables are on-demand.
  - Table names reach the web app through SSM `/vartalap/<stage>/config/*` and reach the Lambdas through provider `environment`.
  - `getConfig()` throws if any `REQUIRED` variable is missing, in the Lambdas too.
  - The web app runs locally with the developer's assumed credentials, so it has no IAM role in the stack.
- **UI** (`apps/web/components/Conversation.js`, `ChatList.js`): the conversation header holds the title and `AssignControl`. There is no side panel. The chat list has tabs (Unassigned/All for admins) and no filters. The conversation polls every 3 s and the chat list every 5 s.

## 3. Research findings
- **Comparable products** (vendor docs, summarized; UI details not re-verified hands-on):
  - **Zendesk:** a user profile has a single agent-only `notes` text field ([Viewing a user's profile](https://support.zendesk.com/hc/en-us/articles/4408822762650), [Users API](https://developer.zendesk.com/api-reference/ticketing/users/users/)). Agents can add user tags once an admin enables user tagging ([Adding tags to users](https://support.zendesk.com/hc/en-us/articles/4408881573658-Adding-tags-to-users-and-organizations)).
  - **Intercom:** many timestamped notes per contact, plus tags attached and detached through separate endpoints ([Tags API](https://developers.intercom.com/docs/references/2.7/rest-api/api.intercom.io/tags), [Attach tag to contact](https://developers.intercom.com/docs/references/2.8/rest-api/api.intercom.io/contacts/attachtagtocontact)).
  - **Front:** contacts are keyed by email or phone ([Understanding Front contacts](https://help.front.com/en/articles/2211)). I found no public article on Front's contact notes, so that part is unverified.
  - **The pattern across all three:** one short "about" field, a timeline of authored notes, and tags. Tags are attached and detached one at a time, and an admin can switch tagging on or restrict it.
- **DynamoDB:**
  - **Item size:** the maximum item size is 400 KB ([quotas](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html)), so an unbounded note list must not live on one item. The one-to-many pattern is partition key = parent, sort key = child ID ([sort-key best practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-sort-keys.html)).
  - **Optimistic locking:** done with a version attribute and a condition expression ([optimistic locking](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBMapper.OptimisticLocking.html), [condition expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html)).
  - **String Sets:** `ADD` and `DELETE` on a String Set are atomic and need no read-modify-write. An empty set cannot be stored, so the attribute disappears when its last element is removed ([update expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html)).
  - **Filter expressions:** applied after items are read, so they cost the same read capacity as an unfiltered Query or Scan ([filter expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.FilterExpression.html)).
  - **GSI keys:** must be scalar (S/N/B), so a GSI cannot index a set of tags directly ([GSI](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)). Filtering by tag at scale needs an adjacency item per (tag, chat).
- **Compliance:** notes are free text about an identifiable person and will contain personal data and opinions. They are therefore in scope for:
  - access and erasure requests under GDPR (Art. 15, 17), Singapore PDPA and Saudi PDPL;
  - purpose limitation and retention.

  The PRD already defers retention, deletion and log masking to before go-live. F4 adds to that list.

## 4. Proposed design

### 4.1 Data model (recommended: small fields on `Chats`, notes in a new table)
**`Chats` item, new attributes.** Bounded size: about 1 KB of description plus at most 10 tags of 32 characters, far below 400 KB.

| Attribute | Type | Notes |
|---|---|---|
| `description` | S, ≤ 1,000 chars | One editable field. Absent when empty. |
| `descriptionUpdatedAt` / `descriptionUpdatedBy` | S / S (userId) | Last editor, shown as "Edited by X, 2 h ago". |
| `profileVersion` | N | Starts at 0. Incremented on every description write. The client sends the version it saw (optimistic lock). |
| `tags` | SS, ≤ 10 | Normalized tag names. Atomic `ADD`/`DELETE`, with no version needed. |

**New table `ClientNotes`** (`vartalap-<stage>-client-notes`, on-demand). Notes are separate items, so they never threaten the 400 KB limit or contend with message appends.

| Attribute | Notes |
|---|---|
| `chatId` (PK) | The same internal key as `Chats`. If F3 re-keys chats, notes follow the same key. Phone numbers are never exposed through the API. |
| `noteId` (SK) | A ULID, so a Query with `ScanIndexForward: false` gives newest first and pages with `before`. |
| `body` | S, 1–2,000 chars, plain text. Rendered as text, never HTML. |
| `authorId`, `authorRole` | `agent` \| `admin` |
| `createdAt`, `editedAt?` | ISO timestamps |
| `deletedAt?`, `deletedBy?` | Soft delete: the tombstone keeps who deleted the note and when, and `body` is `REMOVE`d. |

Alternatives considered:
- **A list of notes on the Chats item:** rejected. It grows without bound and edits by list index race each other. It would also inflate every 3 s conversation poll and every chat-list Scan.
- **A single-table design with notes inside `Chats`:** rejected. It would break the existing Scan and GSI assumptions in `repo.js`.

**Tag filtering:**
- **Phase 1:** add `FilterExpression: contains(tags, :tag)` to the existing `byAssignee` Query and the `all` Scan. This is the same read cost as today and fine at trial volume.
- **Later, at scale:** an adjacency item per (tag, chat) in `ClientNotes` (`chatId = TAG#<tag>`, `noteId = <chatId>`), or a dedicated table written in the same transaction as the tag change.

### 4.2 Tags
- **Free-form by default.** Normalization, done in core:
  - Unicode NFKC, then trim and lowercase.
  - Internal whitespace collapsed to `-`.
  - Must match `^[\p{L}\p{N}][\p{L}\p{N}_-]{0,31}$/u`, so Arabic and other non-Latin tags work.
  - Duplicates collapse into one through the String Set.
- **Limits:** max 10 per chat (`ConditionExpression: attribute_not_exists(tags) OR size(tags) < :max` on `ADD`) and 32 characters each.
- **Autocomplete:** suggestions come from the tags on the chats the user can already list (the chat list response carries `tags`). There is no global tag endpoint, so agents can't discover tags used only on chats they can't see.
- **Optional admin catalog (phase 3):** catalog items `chatId = CATALOG`, `noteId = TAG#<name>` in `ClientNotes`, plus a setting so that only catalog tags are accepted.

### 4.3 Permissions (recommended defaults)
| Action | Assignee agent | Admin | Previous assignee / other agent |
|---|---|---|---|
| Read description, tags, notes | yes | yes | no (`FORBIDDEN`, same as messages) |
| Edit description, add or remove tags | yes | yes | no |
| Add note | yes | yes | no |
| Edit own note | within 15 min of `createdAt` | within 15 min | no |
| Delete note (soft) | own notes only | any note | no |
| Manage tag catalog (phase 3) | no | yes | no |

- All checks reuse `assertCanView` plus `loadChatFor`, so a missing chat is still `FORBIDDEN` for agents.
- A new assignee sees all prior notes, consistent with full history after reassignment.
- Unassigned chats are admin-only, as today.

### 4.4 Audit
- Notes are authored and timestamped. Edits set `editedAt` and the UI shows "edited".
- Deletes leave a tombstone ("Note deleted by Admin, 2026-10-17 14:05"). The body is removed so the deleted text is actually gone.
- The description keeps only the last editor and time. Full edit history (old bodies) is not kept in phase 1: it would preserve personal data the editor meant to remove. If the product owner wants full history, add `HIST#` items with the same retention as notes.

### 4.5 API (M0 conventions; `:phone` today, F3's opaque ID once it lands)
| Method + path | Who | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/chats?filter=…&tag=<tag>` | as today | `tag` optional, normalized | `{ chats: ChatSummary[] }`; each now has `tags: string[]` | `VALIDATION` (bad tag) |
| `GET /api/chats/:id/messages` | as today | — | `chat` (`ChatSummary`) now also has `description`, `descriptionUpdatedAt`, `descriptionUpdatedBy: {userId,name}\|null`, `profileVersion`, `tags` | as today |
| `PUT /api/chats/:id/description` | assignee, admin | `{ description, version }` (`""` clears it) | `200 { chat }` | `VALIDATION`, `FORBIDDEN`, `NOT_FOUND` (admin), `CONFLICT` with `details.current: { description, profileVersion, descriptionUpdatedBy }` |
| `POST /api/chats/:id/tags` | assignee, admin | `{ tag }` | `200 { tags }` (idempotent, so not 201) | `VALIDATION`, `FORBIDDEN`, `CONFLICT` (10-tag limit) |
| `DELETE /api/chats/:id/tags/:tag` | assignee, admin | — | `200 { tags }` | `FORBIDDEN` |
| `GET /api/chats/:id/notes?before=<noteId>&limit=20` | assignee, admin | limit 1–50 | `{ notes: Note[] (newest first), nextBefore \| null }` | `FORBIDDEN`, `NOT_FOUND` (admin) |
| `POST /api/chats/:id/notes` | assignee, admin | `{ body }` | `201 { note }` | `VALIDATION`, `FORBIDDEN` |
| `PATCH /api/chats/:id/notes/:noteId` | author (assignee/admin) | `{ body }` | `200 { note }` | `FORBIDDEN` (not author, or 15 min passed), `NOT_FOUND` (or deleted) |
| `DELETE /api/chats/:id/notes/:noteId` | author or admin | — | `204` | `FORBIDDEN`, `NOT_FOUND` |
| `GET/POST/DELETE /api/tags` (phase 3) | admin | `{ name }` | `{ tags }` / `201 { tag }` / `204` | `CONFLICT` (exists) |

- **Response shape:** `Note` = `{ noteId, body\|null, author: {userId,name}, createdAt, editedAt\|null, deleted: boolean, deletedBy?, deletedAt? }`.
- **The note's ID check:** every note route checks `note.chatId === chatId`. The key enforces it, because the note is read with key `(chatId, noteId)`.
- **Zod schemas** (`packages/core/src/schemas/client.js`, JS only, no `export type`):

```js
export const DESCRIPTION_MAX = 1000;
export const NOTE_BODY_MAX = 2000;
export const TAG_MAX_LENGTH = 32;
export const MAX_TAGS_PER_CHAT = 10;
export const NOTE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const TagSchema = z.string().transform(normalizeTag).pipe(z.string().regex(TAG_REGEX));
export const UpdateDescriptionBodySchema = z.object({ description: z.string().trim().max(DESCRIPTION_MAX), version: z.number().int().min(0) });
export const AddTagBodySchema = z.object({ tag: TagSchema });
export const NoteBodySchema = z.object({ body: z.string().trim().min(1).max(NOTE_BODY_MAX) });
export const ListNotesQuerySchema = z.object({ before: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
// ListChatsQuerySchema gains: tag: TagSchema.optional()
```

- **Description write:** one `UpdateItem` with:
  - `SET description = :d, descriptionUpdatedAt = :now, descriptionUpdatedBy = :u, profileVersion = :v1`
  - `ConditionExpression: attribute_exists(chatId) AND (profileVersion = :v OR (attribute_not_exists(profileVersion) AND :v = :zero))`
  - `ReturnValuesOnConditionCheckFailure: ALL_OLD` to fill `details.current`.
- **Access check race:** to close the gap between the access check and the write, add `AND assignedTo = :caller` for agents. A reassignment between the two then yields `FORBIDDEN`, not a write.

### 4.6 UI
- **Client details panel:** lives in F1's side panel. Until F1 lands, it is a collapsible section under the conversation header.
  - **Description:** shown as text with an "Edit" button that opens an inline textarea with a character counter. Save sends `version`. On `CONFLICT` it shows "Updated by {name} while you were editing", with their text and an option to overwrite or discard.
  - **Tags:** chips with ×, and an input with autocomplete (datalist from tags in the loaded chat list). It shows the normalized form before saving.
  - **Notes:** a timeline, newest first, with author, relative time, "edited" and the deleted tombstone. An add box sits at the top: plain textarea, Ctrl/⌘+Enter to save. Edit and Delete actions appear only where allowed. There is "load older" paging.
  - **Guidance text** under the note box: "Internal only. Never visible to the client. Record only what's needed to help them. Don't paste passport, card or ID numbers."
- **Chat list:** tag chips (max 3, then "+n") on each row, plus a tag filter (dropdown of known tags). It is sent as `?tag=`, combines with the existing tabs, and is kept in the URL query.
- **Polling:** description and tags arrive with the existing 3 s conversation poll, which has no extra request. Notes are fetched when the panel opens, then re-read every 15 s while it is open and the tab is visible.
- **Constants:** new limits are mirrored in `apps/web/lib/constants.js`. Browser code still never imports `@vartalap/core` (M8).

### 4.7 Infrastructure (`services/whatsapp/serverless.yml`)
- Add `ClientNotesTable` (PAY_PER_REQUEST; `AttributeDefinitions` chatId S and noteId S; `KeySchema` chatId HASH and noteId RANGE; no GSI in phase 1).
- Turn on `PointInTimeRecoverySpecification` only if the product owner accepts that it keeps deleted notes for up to 35 days (see §7). Turn on `DeletionProtectionEnabled: true`.
- Add an SSM param `ConfigClientNotesTableParam` (`/vartalap/${sls:stage}/config/CLIENT_NOTES_TABLE`, `Value: !Ref ClientNotesTable`) and an `Outputs.ClientNotesTableName`.
- Add `CLIENT_NOTES_TABLE` to `SSM_CONFIG_KEYS` (`config-loader.js`).
- In `config.js`, either add it to `REQUIRED` and set `CLIENT_NOTES_TABLE: !Ref ClientNotesTable` in provider `environment` (simplest), or make it an optional key that is checked only where used. The first is recommended for consistency.
- **IAM:** none. The Lambdas don't read or write notes or the new Chats attributes, so no Lambda statement changes are needed. Under `perFunction` roles they get no access to `ClientNotesTable`, which is what we want. The web app uses the developer's assumed role. For a future deployed web app, its role needs `GetItem/PutItem/UpdateItem/Query/DeleteItem/BatchWriteItem` on `ClientNotesTable`, and `UpdateItem/Query/Scan` on `ChatsTable` (already needed).

### 4.8 Security and privacy
- **Never sent to WhatsApp:** notes, description and tags have no path to `OutboundQueueMessageSchema` or the sender Lambda. A test in phase 1 asserts that the queue payload stays `{ messageId, chatId }`.
- **Never logged:** note bodies, the description and tag values never appear in logs. `withHandler` already never logs bodies. New core code must not include `body` or `description` in `AppError` messages or details. `VALIDATION` issues carry path and message, not the value.
- **Rendered as plain text** (React escaping). No markdown or links in phase 1.
- **Erasure:** a client erasure, when it is built (PRD "Deferred"), must:
  - Query and BatchWrite-delete every `ClientNotes` item for the `chatId`;
  - `REMOVE description, tags` on the chat;
  - cover backups too (PITR window).

  Subject-access export must include notes, description and tags.
- **Retention:** this is an open decision. The recommendation is to keep attributes as long as the chat is kept, and tie them to whatever chat retention is decided before go-live.
- **Tags as special-category data:** tags can encode sensitive categories, for example health or religion via `umrah-medical`. The guidance text and the admin catalog (phase 3) help limit that.

## 5. Affected modules and files
- **M0/M1 (contracts and infra):**
  - `docs/modules/m0-foundation.md` (API table, `ChatSummary`);
  - `docs/arch/boilerplate.md` §4 (new attributes, §4.4 `ClientNotes`);
  - `services/whatsapp/serverless.yml`.
- **Core:**
  - `packages/core/src/schemas/client.js` (new), `schemas/chat.js` (optional fields), `schemas/api.js` (`ListChatsQuerySchema.tag`);
  - `packages/core/src/clients/` (new: `profile.js` for description and tags, `notes.js`, `normalize-tag.js`), plus `index.js` exports;
  - `chats/repo.js` (tag filter), `config.js`, `config-loader.js`.
- **M7 (web API):**
  - new routes `apps/web/app/api/chats/[phone]/description/route.js`, `tags/route.js`, `tags/[tag]/route.js`, `notes/route.js`, `notes/[noteId]/route.js`;
  - `chats/route.js` (passes `tag`);
  - `lib/api.js` (`toChatSummary` adds the `descriptionUpdatedBy` name).
- **M8 (web UI):**
  - new `components/ClientPanel.js`, `NotesTimeline.js`, `TagInput.js`;
  - `Conversation.js`, `ChatList.js`, `lib/client-api.js`, `lib/constants.js`, `globals.css`.
- **Coordination with parallel features:**
  - **F3:** route param and key naming. F4 uses whatever ID F3 exposes and must not add phone numbers to any new response.
  - **F1:** the panel's layout.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| 1 | Free-form tags or an admin-managed catalog? | Free-form, normalized, with autocomplete. The admin catalog and a "catalog only" switch come in phase 3 if tags sprawl. |
| 2 | Can agents delete other people's notes? | No. Agents delete only their own. Admins delete any. Every delete is soft, with a tombstone and the body removed. |
| 3 | Note edit window? | Author only, 15 min, shown as "edited". After that, add a new note instead. |
| 4 | Keep the description's edit history? | No. Keep the last editor and time only. |
| 5 | Can agents tag or annotate unassigned chats? | No (they can't see them). Admins can. |
| 6 | Max tags per chat and lengths? | 10 tags, 32 chars each. Description 1,000 chars, note 2,000 chars. |
| 7 | Retention of notes? | Same as the chat, to be decided with the PRD's deferred retention item before go-live. Erasure deletes all notes. |
| 8 | Turn on PITR for `ClientNotes`? | Off for the trial, because PITR keeps erased data for 35 days. Revisit with InfoSec at go-live. |
| 9 | Should other clients' attributes (e.g. company) be structured custom fields? | Out of scope. Description, notes and tags only. Custom fields could come later as `attr.<key>` items. |

## 7. Risks
- **Personal data in free text:** agents will paste sensitive data (passport, card numbers). Mitigations: guidance text, an optional phase-3 client-side pattern warning for card- and passport-like numbers, and erasure support. Flag to InfoSec before go-live.
- **Erasure misses backups:** PITR or on-demand backups keep deleted notes. Erasure must document this window.
- **Lost updates on the description:** mitigated by `profileVersion`. Tags avoid conflicts through set `ADD`/`DELETE`.
- **Hot item contention:** description and tag writes share the Chats item with message appends. `appendMessage` already retries `TransactionConflict`, and the volume is tiny. Notes are on a separate table.
- **Tag filter cost:** the filter reads everything the tab reads. Fine at trial scale; at scale it needs the adjacency index (§4.1).
- **Coupling to F3:** if F3 changes the route key or `chatId`, the F4 routes and `ClientNotes` PK must move with it. Land F3's key decision first, or build F4 on `chatId` internally behind whatever route param F3 picks.
- **Access race on reassignment:** closed for description and tags by the `assignedTo` condition. For notes, add a `ConditionCheck` on the Chats item in a transaction with the `Put` (cheap, recommended).

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Backend | `ClientNotes` table, SSM and config; core schemas and repo (description with version, tags with set ops and limit, notes CRUD with soft delete and edit window, access conditions); new routes; `ChatSummary` fields; `?tag=` filter; doc updates (M0, boilerplate §4) | M |
| 2. UI | Client panel (in F1's panel if available), inline description editor with conflict handling, tag chips and autocomplete, notes timeline with paging, chat-list tag chips and filter, guidance text | M |
| 3. Governance | Admin tag catalog and "catalog only" setting; sensitive-number warning; erasure and export hooks with the PRD's deferred compliance work | S–M |

## 9. Acceptance criteria
- [ ] The assignee agent and admins can read and edit the description. A second editor with a stale `version` gets `409 CONFLICT` with the current value, and nothing is overwritten.
- [ ] Adding the same tag twice leaves one tag. An 11th tag is rejected (`CONFLICT`). `" VIP  Client "` is stored as `vip-client`, and an Arabic tag is accepted.
- [ ] `GET /api/chats?filter=mine&tag=vip` returns only the caller's chats tagged `vip`. An agent can't use `tag` to see other agents' chats.
- [ ] `POST .../notes` returns `201` with author and time. Notes list newest first and page with `nextBefore`.
- [ ] The author can edit within 15 min; after that, or as a non-author, `FORBIDDEN`. Agents can delete only their own notes, admins any. A deleted note shows a tombstone with no body, and the body is gone from DynamoDB.
- [ ] After reassignment from agent A to agent B, A gets `403` on every F4 route. B sees all notes, description and tags.
- [ ] A missing chat gives agents `FORBIDDEN`, and admins `NOT_FOUND`.
- [ ] No note body, description or tag value appears in API or Lambda logs. Nothing from F4 is put on the SQS queue or sent to WhatsApp.
- [ ] No F4 response contains a client phone number beyond what F3 allows.
- [ ] Lambdas have no IAM access to `ClientNotes`. `sls deploy` creates the table and the `CLIENT_NOTES_TABLE` SSM config, and the web app picks it up with only `AWS_REGION` and `STAGE` set.
