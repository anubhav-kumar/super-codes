# F3: Hide the Client's Phone Number from Agents

Status: Research · 2026-10-17 · Builds on: M0, M2, M4, M5, M6, M7, M8

## 1. Goal
Agents must never be able to see a client's phone number: not in the UI, the URL, browser history, devtools (network tab, JSON responses, React state), or error messages. Today the number is the chat's identity everywhere, so any agent can read it from the address bar. This is a data-minimisation measure: agents need the conversation, not the contact detail, and a number taken off-platform lets an agent contact the client outside Vartalap.

**Who it's for:** the business (privacy and compliance) and its clients. **In scope:** everything served to an agent's browser. **Server side** (DynamoDB keys, SQS, Lambda logs) stays internal, but logs should not get worse.

## 2. Current state
The phone number (E.164) is the chat's primary key and is passed through unchanged at every layer.

- **Data model:** `Chats.chatId` (PK) = phone, and `Messages.chatId` = phone on every item (`docs/arch/boilerplate.md` §4; `packages/core/src/schemas/chat.js:9`, `schemas/message.js:14`, both `PhoneSchema`). Inbound `messageId` = WhatsApp `wamid` (`services/whatsapp/src/handlers/webhook.js:66`), which deduplicates through the `attribute_not_exists(messageId)` put (`packages/core/src/messages/append.js:91`).
- **API:** every per-chat route is `/api/chats/[phone]/…`. `getChatId()` URL-decodes the param and normalizes it to E.164 (`apps/web/lib/api.js:120`). Responses are the raw DynamoDB items: `Chat`/`ChatSummary` include `chatId`, and every `Message` includes `chatId` and `waMessageId` (`apps/web/app/api/chats/[phone]/messages/route.js:34,86`; `packages/core/src/chats/repo.js:40`).
- **UI:** links are `/chats/${encodeURIComponent(chat.chatId)}` (`apps/web/components/ChatList.js:79`). The page reads the phone from `useParams().phone` (`app/(staff)/chats/[phone]/page.js:15`). The conversation header prints `{chat.chatId}` under the title for **every role** (`components/Conversation.js:199`). `chatTitle()` falls back to `chatId` when `clientName` is blank (`lib/format.js:30`).
- **Access control is already correct:** `loadChatFor` returns `FORBIDDEN` (not `NOT_FOUND`) to agents for a missing chat, so guessing numbers does not reveal which chats exist (`lib/api.js:133`). F3 is about exposure, not authorization.
- **Logs:** web `maskDigits` keeps the last 4 digits of long digit runs (`lib/api.js:20`). Lambdas log `phoneTail`/`lastFour` (`parse.js:7`, `sender.js:100`).
- **SQS:** body `{ messageId, chatId }`, `MessageGroupId = chatId` (`apps/web/lib/queue.js:14-19`). This is server only.

### Leak inventory
"Agent" = an agent viewing their own assigned chat. Admins see everything an agent sees, plus admin-only routes.

| # | Location | Who sees it today | Fix |
|---|---|---|---|
| 1 | Address bar `/chats/%2B…` (`ChatList.js:79`) | agent, admin | Route by opaque `publicId` |
| 2 | Browser history, autocomplete, bookmarks, synced history on other devices | agent, admin | Same as #1. Old entries stay until cleared (see §7) |
| 3 | Next.js `<Link>` prefetch / RSC requests (`?_rsc=`) for every chat in the list | agent, admin (network tab) | Same as #1 |
| 4 | `/login?next=/chats/%2B…` after a 401 or an expired session (`client-api.js:14`, `proxy.js:12`) | agent, admin | Same as #1 |
| 5 | API paths `/api/chats/:phone/messages`, `/assign`, `/auto-assign` (`client-api.js:49`) | agent, admin (network tab) | Same as #1 |
| 6 | `ChatSummary.chatId` in `GET /api/chats` | agent, admin | Server-side view: drop `chatId`, add `id` |
| 7 | `chat.chatId` in `GET …/messages` and in `{ chat }` from assign/auto-assign | agent, admin | Same as #6 |
| 8 | `Message.chatId` on every message in GET and the POST response | agent, admin | Message view without `chatId` |
| 9 | `Message.waMessageId` and inbound `messageId` = `wamid`. Also `headMessageId`, `nextBefore` and the `?before=` query, which hold message IDs | agent, admin | Phase 2: inbound messages get ULID IDs, and `waMessageId` is never returned. **Confirmed (2026-10-17):** the wamid body is base64 and embeds the counterpart's number (see §3) |
| 10 | Conversation header subtitle `{chat.chatId}` (`Conversation.js:199`) | agent, admin | Agents: nothing. Admins: `phone` field |
| 11 | Title fallback `clientName \|\| chatId` (`format.js:30`) in the list and header | agent, admin (chats with no profile name) | Server-computed `displayName`, e.g. `Client #K7QD` |
| 12 | `clientName` that is itself a number (some users set their profile name to their number) | agent, admin | For agents, treat a name with ≥5 digits as missing (fallback name) |
| 13 | React state / React DevTools (`key={chat.chatId}`, props) | agent, admin | Follows from #6–#8 (the browser never receives it) |
| 14 | Error bodies: `VALIDATION "Invalid phone number"` echoes the param's meaning; `assignChat` `NOT_FOUND` has `details: { chatId }` (`assign.js:35`), and `toBody()` returns `details` | admin (assign); agent (validation text only) | Drop `chatId` from details; an unknown or invalid `publicId` gets the same `FORBIDDEN`/`NOT_FOUND` as a missing chat |
| 15 | Message text and `lastMessagePreview` where the client types a number | agent, admin | Out of scope by default (open decision D4) |
| 16 | Local `next dev` terminal request log (`GET /api/chats/%2B…`) | developer | Same as #5 |
| 17 | Web/Lambda logs (last 4 digits), SQS body, DLQ, DynamoDB console | AWS operators only | Keep last 4 digits; optional: log `publicId`, phone-free SQS body (§4.6) |
| 18 | `Referer` header | none today: messages render as plain text with no outbound links, and default `strict-origin-when-cross-origin` sends only the origin cross-site | Set `Referrer-Policy: same-origin` as defence in depth |

## 3. Research findings
- **Indirect references.** OWASP recommends exposing an indirect, non-guessable identifier mapped server-side to the real key, *in addition to* an access check on every request, never instead of one ([OWASP IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html); [OWASP Top 10 A01:2021](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)). Vartalap's `canView` stays the control. `publicId` removes the disclosure.
- **Personal data in URLs** ends up in history, proxy and server logs, and Referer headers ([CWE-598](https://cwe.mitre.org/data/definitions/598.html); [CWE-359, exposure of private personal information](https://cwe.mitre.org/data/definitions/359.html)). A path segment carries the same risk as a query string.
- **Masking only in the UI (option c) is insufficient.** The number would still be in the JSON, the URL and the history, and anyone can read those in devtools. Redaction must happen on the server, before serialization.
- **Regulation (brief):**
  - GDPR Art. 5(1)(c) data minimisation and Art. 25 data protection by design and by default ([Art. 5](https://gdpr-info.eu/art-5-gdpr/), [Art. 25](https://gdpr-info.eu/art-25-gdpr/)). Art. 32 names pseudonymisation as a security measure ([Art. 32](https://gdpr-info.eu/art-32-gdpr/)).
  - Singapore PDPA Protection Obligation, s24: reasonable security arrangements ([PDPC Key Concepts guidelines](https://www.pdpc.gov.sg/guidelines-and-consultation/2020/03/advisory-guidelines-on-key-concepts-in-the-personal-data-protection-act)).
  - Saudi PDPL: collection limited to the minimum necessary, with identifying content avoided once the purpose is met. A third-party reproduction places this at Art. 11(3) ([myctrl.tools](https://myctrl.tools/frameworks/sa-pdpl/article-11-3)). **Unverified:** the article number is not from the official SDAIA text.
  - The PRD (§Deferred) already flags log masking and client data under these laws. F3 is a first concrete step, not full compliance.
- **wamid contents: confirmed to embed the phone number.** Meta does not document the format. Decoding the sample wamid from Meta's Cloud API docs (`HBgLMTY1MDUwNzY1MjAVAgAR…`, a public test number, quoted from memory of the docs, not re-fetched) gives bytes containing `16505076520`, the counterpart's wa_id in plain digits. So any wamid shown to an agent leaks the number. A quick re-check on one dev wamid (decode locally, don't record it) is still worthwhile, but Phase 2 is required.
- **DynamoDB:** a GSI can be added to an existing table in place, one GSI create per stack update. GSI reads are eventually consistent only, and GSIs cannot enforce uniqueness ([AWS GSI docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)).

## 4. Proposed design
### 4.1 Options compared
| Option | How | Migration cost | Verdict |
|---|---|---|---|
| (a1) **Keep phone as the internal key; add a `publicId` attribute + GSI `byPublicId`** | Random ID stored on the chat. Routes resolve `publicId → chatId` | Low: an additive attribute and a GSI, lazy and scripted backfill. `Messages.chatId`, SQS, webhook and sender are unchanged | **Recommended** |
| (a2) New opaque PK; phone becomes an attribute + GSI | Re-key Chats and Messages | High: rewrite every item and the `byAssignee` usage. The webhook needs a phone → chat lookup on every inbound | Rejected: same exposure result for far more work |
| (b1) HMAC(phone, key) as the token | Deterministic, no write needed | Needs a stored attribute + GSI anyway to reverse it, so it is (a1) with a worse ID. Key rotation breaks every link | Rejected |
| (b2) Reversible encryption (AES-SIV) of the phone | Stateless | No storage, but a leaked key decodes every URL ever logged. Long tokens; no revocation | Rejected |
| (c) Mask in the UI only | CSS/JS | None | Insufficient (§3) |

### 4.2 Data model
- **`Chats.publicId`** (new, string): 16 random bytes (`crypto.randomBytes`) as Crockford base32, prefixed `c_` (for example `c_7K…`, 28 characters). Random rather than ULID, so it carries no timestamp and cannot be guessed. Created once and never changed.
- **GSI `byPublicId`** (PK `publicId`, projection `KEYS_ONLY`): returns `chatId`. The GSI is sparse until the backfill completes.
- **Writing it:** `appendMessage`'s chat update adds `publicId = if_not_exists(publicId, :pid)` on **every** append (`append.js:109`). New chats get one at creation, and existing chats heal on their next message. The existing `attribute_not_exists(chatId)` condition makes concurrent creates safe: the losing writer retries, and `if_not_exists` keeps the winner's ID.
- **Phase 2, messages:** inbound `messageId` becomes a ULID. Dedup moves to a guard item `WAMID#<wamid>` in the Messages table, put with `attribute_not_exists` in the same transaction. This is the same pattern as Users' `EMAIL#` guard. `waMessageId` stays stored (for `byWaMessageId`) but is never returned. Transaction order: guard, message, chat. A guard failure means a duplicate.
- `Messages.chatId`, `byAssignee` and the SQS FIFO grouping are unchanged.

### 4.3 Server-side views (the only way chats and messages leave the API)
New `packages/core/src/chats/view.js`, plus `messages/view.js`:
- `toChatView(chat, viewer)` → `{ id: publicId, displayName, clientName, phone?, headMessageId, assignedTo, assignee, lastClientMessageAt, lastMessageAt, lastMessagePreview, windowOpen }`. `phone` is present **only** when `viewer.role === 'admin'` (D1). For agents, `clientName` is `null` when it contains ≥5 digits.
- `displayName` = `clientName` (sanitized per role) or else `Client #` + the last 4 characters of `publicId`, uppercased. It never contains phone digits (D3).
- `toMessageView(message)` → the message without `chatId`, `waMessageId` or `statusRank`.
- Routes never return raw items. `listChatsForUser` keeps returning internal items, and the route maps them through the views.

### 4.4 API contract changes (M0)
| Old | New |
|---|---|
| `GET /api/chats/:phone/messages` | `GET /api/chats/:id/messages` (`:id` = `publicId`) |
| `POST /api/chats/:phone/messages` | `POST /api/chats/:id/messages` |
| `PUT /api/chats/:phone/assign` | `PUT /api/chats/:id/assign` |
| `POST /api/chats/:phone/auto-assign` | `POST /api/chats/:id/auto-assign` |
| `ChatSummary` = `Chat` + `assignee`, `windowOpen` (includes `chatId`) | `ChatView` = `{ id, displayName, clientName, phone (admin only), headMessageId, assignedTo, assignee, lastClientMessageAt, lastMessageAt, lastMessagePreview, windowOpen }` |
| `{ chat }` from assign/auto-assign = raw `Chat` | `{ chat: ChatView }` |
| `Message` includes `chatId`, `waMessageId` | `MessageView` without them; inbound `messageId` is a ULID (Phase 2) |
| Invalid `:phone` → `400 VALIDATION` | Unknown or malformed `:id` → agents `403 FORBIDDEN`, admins `404 NOT_FOUND` (same as a missing chat today) |

Route resolution: `resolveChat(context, user, assert)` replaces `getChatId` + `loadChatFor` in `lib/api.js`. It validates the `c_` format, queries `byPublicId`, does a consistent `getChat(chatId)` and then the access check. GSI lag only affects a chat created within the last second or so, which is not yet in any list either.

### 4.5 UI (M8)
- Rename the route folder `app/(staff)/chats/[phone]` to `[id]`. `ChatList` links to `/chats/${chat.id}`, and the active-row check uses `id`. `client-api.js` `chatPath(id)`.
- `chatTitle(chat)` returns `chat.displayName`. The header subtitle shows `chat.phone` only when present (admins), else "assigned to you".
- `Conversation.loadOlder` keeps sending `?before=<messageId>`. After Phase 2 that is a ULID.

### 4.6 Infra, logging and SQS
- **Logs:** keep the last-4 policy in server logs (operators may need it to match a Meta support case). Agents have no AWS access (assumption). Add `publicId` to web logs where it is available. `maskDigits` stays as a safety net.
- **SQS (optional, Phase 3):** the body becomes `{ messageId }` with `MessageGroupId = publicId`, so the queue and the DLQ are phone-free. The sender already reads `to` from the stored message (`sender.js:45`). Accept a legacy `chatId` field during rollout.
- **Headers:** `Referrer-Policy: same-origin` in `next.config.mjs`.
- **IAM:** the web app needs `dynamodb:Query` on `…-chats/index/byPublicId`. The webhook needs nothing new.

## 5. Affected modules and files
- **M0/M1:**
  - `packages/core/src/schemas/chat.js` (`publicId`, `ChatViewSchema`), `schemas/message.js` (`MessageViewSchema`), `schemas/api.js` (`OutboundQueueMessageSchema`, Phase 3).
  - `services/whatsapp/serverless.yml`: GSI `byPublicId`, web IAM.
- **M2:** `packages/core/src/messages/append.js` (`publicId`; Phase 2 guard item and cancellation-reason indices), new `messages/view.js`.
- **M4:** `packages/core/src/chats/repo.js` (`getChatByPublicId`), `chats/assign.js` (drop `chatId` from error details), new `chats/view.js`, `index.js` exports.
- **M5:** `services/whatsapp/src/handlers/webhook.js` (Phase 2: no `messageId: wamid`). Redeploy is needed in any case, because core is bundled.
- **M6:** `services/whatsapp/src/handlers/sender.js` (Phase 3 payload).
- **M7:**
  - `apps/web/lib/api.js` (`resolveChat`), `lib/queue.js`.
  - Rename `app/api/chats/[phone]` to `[id]`.
  - All four chat route handlers, plus `app/api/chats/route.js` (views).
- **M8:** `app/(staff)/chats/[phone]/page.js` (rename to `[id]`), `components/ChatList.js`, `components/Conversation.js`, `components/AssignControl.js`, `lib/client-api.js`, `lib/format.js`.
- **New:** `scripts/backfill-chat-public-ids.js`.
- **Docs:** `PRD.md` (chat identity wording), `arch/boilerplate.md` §4/§5, `m0`, `m2`, `m4`–`m8`.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Do admins see the full number? | **Yes**, in the `phone` field and the conversation header only, never in URLs. Agents never see it |
| D2 | Should admin URLs also use `publicId`? | **Yes.** One route shape, and no phone in admins' history or `?next=` |
| D3 | Agent fallback name: last digits (`Client ••34`) or `Client #K7QD`? | **`Client #K7QD`** (from `publicId`). The last digits plus country context still narrow identity, and they add nothing for the agent |
| D4 | Redact numbers that appear in message text or previews for agents? | **No, for now.** The client chose to share it, and agents may need a number given for a booking. Revisit with F4 notes and the PDPL review. Optional later: mask only the client's own number |
| D5 | Profile names with ≥5 digits: hide from agents? | **Yes**, fall back to `displayName` |
| D6 | Keep last-4 in server logs, or switch to `publicId` only? | **Keep last-4, and add `publicId`.** Revisit in the deferred log-masking review |
| D7 | Existing dev data: migrate or reset? | **Backfill `publicId` on chats. Reset Messages/Chats on `dev` before Phase 2** (trial data only; confirm nothing needs keeping) |
| D8 | Should old `/chats/+…` URLs redirect? | **No.** They return "not a valid chat address". A redirect would let anyone confirm numbers |
| D9 | Phone-free SQS payload (Phase 3)? | **Yes**: low cost, and it keeps the DLQ clean |

## 7. Risks
- **Missed serializer path:** one route returning a raw item re-leaks the number. Mitigations: views live in core, routes import only views, and the review includes a grep for `chatId` in `apps/web/app/api` and `components`.
- **Existing browser history and sync** keep old phone URLs on agents' devices. They cannot be purged remotely. Ask staff to clear Vartalap history after rollout, and note this for the compliance file.
- **Deploy ordering:** if the web app switches before the webhook Lambda (which bundles core) writes `publicId`, new chats arrive without one and can't be opened. Order: infra + core + Lambdas, then backfill, then web.
- **GSI eventual consistency:** a just-created chat may 403 for about a second. That is acceptable, because it is not listed yet either.
- **Phase 2 append change** touches the highest-risk module (M2). Mitigations: re-run M2's "Done when" concurrency and dedup checks, and the M9 E2E.
- **wamid leak (confirmed):** wamids embed the client's number, so Phase 2 (inbound ULID IDs, never returning `waMessageId`) is required, not optional. Until it ships, Phase 1 alone still leaks the number through message IDs in API responses.
- **Residual human channels:** an agent can ask the client for their number, or read it from a screenshot the client sends. Policy, not code.
- **Admins** still see numbers. An admin account compromise exposes all of them (unchanged from today).

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Opaque chat IDs | `publicId` + GSI + IAM; `if_not_exists` in append; backfill script; `getChatByPublicId`/`resolveChat`; chat and message views (drop `chatId`, role-based `phone`, `displayName`, D5 sanitizing); routes and UI renamed to `[id]`; header and title fixes; `assign.js` error details; `Referrer-Policy`. Deploy order per §7 | M |
| 2. Opaque message IDs | Inbound ULID + `WAMID#` guard dedup; stop returning `waMessageId`; reset dev Messages/Chats (D7); re-run M2/M5 checks | M |
| 3. Hardening | Phone-free SQS payload (D9); `publicId` in logs (D6); docs (M0, boilerplate, M2, M4–M8, PRD) | S |
| 4. Optional | Mask the client's own number in text and previews for agents (D4) | S |

## 9. Acceptance criteria
- [ ] Signed in as an agent and using a chat whose client has no profile name: the address bar, browser history, the `?next=` login redirect, and every request URL and response body in the devtools Network tab contain no part of the client's number (search the HAR for the full number, the number without `+`, and its last 7 digits).
- [ ] The agent's chat list and conversation header show `clientName` or `Client #XXXX`, never digits from the number. A profile name made of a phone number shows the fallback.
- [ ] `GET /api/chats`, `GET/POST /api/chats/:id/messages` contain no `chatId` or `waMessageId` field for any role. Admin responses contain `phone`; agent responses do not.
- [ ] After Phase 2, no `messageId`, `headMessageId` or `nextBefore` returned to the browser starts with `wamid`.
- [ ] An agent requesting another agent's or a made-up `:id` gets `403`, the same as today. `/api/chats/+<number>/messages` returns `403` for agents and `404` for admins, and reveals nothing.
- [ ] Inbound dedup still holds: replaying one webhook payload stores one message. M2's concurrent-append check still passes.
- [ ] Assignment, auto-assign, send, status ticks and paging work end to end on `dev` (M9 script) via `publicId` URLs.
- [ ] Every existing `dev` chat has a `publicId` after the backfill, and new inbound chats get one on creation.
- [ ] Server logs contain at most the last 4 digits of a number, never the full number.
