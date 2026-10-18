# I10: Inbox Productivity (Conversation Status, Search, Quick Replies, Business Hours, Routing)

Status: Research · 2026-10-17 · Builds on: M2, M4, M7, M8 · Related: F1 (UI), F3 (opaque IDs), F4 (tags), F5 (templates), I8 (notifications)

## 1. Goal
Teams pay for a shared inbox because it makes them faster than a phone running WhatsApp Business. Today Vartalap is a correct but bare inbox: every chat is open forever, nothing can be searched, every reply is typed from scratch, and an off-hours message gets no answer until someone logs in. I10 adds the everyday tools competitors ship as standard: open/pending/resolved status, search, saved replies, business hours with an automatic away message, and smarter assignment.

**Who it's for:** agents (speed) and admins (control of workload and coverage). **Out of scope:** chatbots and flows (see D7), analytics on these states (I11).

## 2. Current state
- **No conversation state:** a chat is "one continuous conversation with one client … no sessions or tickets" (`docs/PRD.md` §Chats). The `Chats` item has no status, so "done" chats stay in the agent's list forever, sorted by `lastMessageAt` (`docs/arch/boilerplate.md` §4.2, GSI `byAssignee`).
- **Lists:** `mine` and `unassigned` query `byAssignee`; `all` is a full Scan (`packages/core/src/chats/repo.js`). `ListChatsQuerySchema` accepts only `filter` (F4 adds `tag`).
- **No search:** neither chat nor message search exists. Messages are a linked list keyed by `messageId` (M2), so there is no index by text or time per chat.
- **No canned replies:** `Composer.js` is a plain textarea.
- **No business hours or auto-replies:** inbound messages are stored and wait (`services/whatsapp/src/handlers/webhook.js`). Nothing is ever sent automatically.
- **Assignment:** manual or round-robin by `lastAutoAssignedAt` among active agents (`packages/core/src/users/repo.js:205-238`). An admin must click; there is no automatic assignment of new chats, no capacity limit and no "away" state for agents.
- **No unread state** (F1 Phase 4 deferred).

## 3. Research findings
- **Market baseline (vendor pricing and feature pages, summarised; not verified hands-on):** WhatsApp shared-inbox products ([respond.io](https://respond.io/pricing), [Trengo](https://trengo.com/pricing), [WATI](https://www.wati.io/pricing/)) all list conversation status (open/pending/solved or similar), canned/quick replies, business hours with away messages, auto-assignment rules and contact search on their entry plans. These are table stakes for a paid plan, not differentiators.
- **Automated messages and the 24-hour window:** an automatic reply sent in response to an inbound message is a free-form "service" message inside the customer service window, so it needs no template ([Meta: Customer service windows](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#customer-service-windows)).
- **Automation and AI policy (relevant to D7):**
  - The WhatsApp Business Messaging Policy (updated 2026-09-23) allows automation inside the 24-hour window only with "prompt, clear, and direct escalation paths" to a human ([policy](https://whatsappbusiness.com/policy/)).
  - The Business Solution Terms, effective 2026-01-15, bar AI providers whose primary functionality is general-purpose AI ([terms](https://www.whatsapp.com/legal/business-solution-terms/)). Meta said businesses using AI for their own customer service are not affected ([TechCrunch, 2025-10-18](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/); secondary source).
- **DynamoDB search:** DynamoDB has no full-text search. Options are a prefix-only GSI, a zero-ETL integration from DynamoDB to Amazon OpenSearch Service ([DynamoDB zero-ETL with OpenSearch](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/configure-client-ddb.html)), or a self-managed index fed by DynamoDB Streams. OpenSearch Serverless has a minimum OCU cost that is significant for a small product ([OpenSearch Serverless pricing](https://aws.amazon.com/opensearch-service/pricing/)) — **unverified** current minimums.
- **Encrypted search conflict:** indexing message text in a second store doubles the places personal data lives and must be covered by retention and erasure (I7).

## 4. Proposed design

### 4.1 Conversation status
- New `Chats.status`: `open` | `pending` (waiting on the client) | `resolved`. `snoozedUntil?` (ISO) for "remind me later".
- **Transitions:**
  - Inbound client message → `open` (reopens `resolved` and `pending`, clears `snoozedUntil`). Done inside `appendMessage`'s chat update (`isClientMessage` path).
  - Agent/admin: "Mark pending", "Resolve", "Snooze until…". `PUT /api/chats/:id/status { status, snoozedUntil? }`, assignee or admin only.
  - Resolving keeps the assignee by default (D2), so if the client writes back, the same agent picks it up.
- **Lists:** tabs become **Open** (default), **Pending**, **Resolved**, plus the existing Mine/Unassigned/All scopes. Implemented with a new GSI `byAssigneeStatus` (PK `assignedTo#status`, SK `lastMessageAt`), so the default view no longer reads resolved chats. The admin "All" view moves from Scan to a query per status on a GSI `byStatus` (PK `workspaceId#status` after I2).
- **Snooze:** an EventBridge Scheduler one-off schedule per snooze, or a 5-minute sweep Lambda that queries `byStatus` for `pending` with `snoozedUntil <= now` and reopens. The sweep is simpler; recommended (D4).
- **Window interplay:** a chat whose 24-hour window has closed and is still `open` shows a "Window closed: send a template" action (F5).

### 4.2 Unread and "needs reply" (closes F1 Phase 4)
- Per user per chat: `lastReadMessageId` in a small `ChatReads` item (PK `userId`, SK `chatId`). The list shows a bold row and a count when `headMessageId` differs and the latest message is inbound.
- `Chats.awaitingReplySince`: set on an inbound message, cleared on an outbound one. Drives "waiting 2 h" badges and the first-response metrics in I11.

### 4.3 Search
Two levels, shipped in order:
1. **Chat search (Phase 1):** by client name, `Client #XXXX` display name, tag (F4) and, for admins only, phone number (F3 D1). Done in the API over the caller's visible list at current volumes; a `byNameLower` GSI later.
2. **Message search (Phase 3):** full text across messages the caller may see.
   - **Recommended:** DynamoDB Streams → a small Lambda → an OpenSearch (or a hosted search like Typesense/Meilisearch Cloud) index with `workspaceId`, `chatId`, `assignedTo`, `createdAt`, `text`. Queries are always filtered by workspace and, for agents, by `assignedTo = me`, applied server-side.
   - Index stores only what's needed to find and link; results are re-checked with `canView` before returning snippets.
   - Erasure (I7) deletes from the index too.
- UI: a search box above the chat list; results show chat title, snippet with the match highlighted, and jump to the message (paging back via `?before=`).

### 4.4 Quick replies (canned responses)
- New table `QuickReplies` (PK `workspaceId`, SK `quickReplyId`): `shortcut` (`/refund`), `title`, `body` (≤ 4,096 chars), `scope` (`workspace` | `personal` + `ownerId`), `createdBy`, `updatedAt`.
- Variables (Phase 2): `{{client.name}}`, `{{agent.name}}`, `{{workspace.name}}`, filled client-side before send; the text the agent sends is the final text.
- Admins manage workspace replies; any user manages personal ones.
- Composer: typing `/` opens a filtered picker; Enter inserts the body for editing. Nothing is sent without the agent pressing Send.
- Media attachments in quick replies come after F2.

### 4.5 Business hours and automatic messages
- Workspace settings: timezone (default from the workspace country, D5), weekly hours, holidays.
- Automatic messages (each optional, editable, per workspace):
  - **Away message:** sent once per conversation per off-hours period when a client writes outside hours.
  - **Greeting:** sent on the first-ever message from a new client.
  - **Assignment notice (optional):** "Hi, {{agent.first_name}} will help you" when a chat is assigned.
- **Where they run:** the webhook, after `appendMessage`, decides and appends an outbound message with `senderType: 'system'`, then enqueues it like any other send. Rate-limited per chat (`lastAutoReplyAt`) so a burst of client messages yields one reply.
- System messages are labelled "Automatic" in the UI, like "sent by admin" today.

### 4.6 Assignment rules
- **Auto-assign new chats** (workspace setting): off (today's behaviour) | round-robin | least-busy (fewest `open` chats).
- **Agent availability:** `Users.availability` = `online` | `away`, set by the agent; auto-assignment skips `away` agents. Optional automatic `away` after N minutes without activity (D6).
- **Capacity:** optional max open chats per agent; above it, chats stay unassigned.
- **Teams (Phase 4):** `Teams` with members; a chat can be routed to a team queue first, then to an agent. Needed by larger customers (sales vs support).
- **Sticky assignment:** a returning client goes to their previous agent if that agent is active and available (default on).
- **Reassign on inactivity (optional):** an `open` chat with no agent reply for N minutes returns to the unassigned queue and notifies admins (I8).

### 4.7 Small items that make a difference
- Keyboard shortcuts: `j/k` next/previous chat, `e` resolve, `/` quick replies, `Ctrl/⌘+K` search.
- Draft per chat kept in `localStorage` (no personal data leaves the browser).
- "Copy message" and "Reply to message" (WhatsApp `context.message_id` quoting) in the conversation.
- Internal "@mention a colleague" in F4 notes, notifying them (I8).

### 4.8 Security and privacy
- Every new route reuses `resolveChat` + `assertCanView`/`assertCanSend`; quick replies and settings are workspace-scoped (I2).
- Automatic messages are business content, not personal data; they must not include variables from F4 notes.
- Search indexes are personal data stores: workspace-filtered on every query, covered by retention and erasure (I7), and never queried from the browser directly.

## 5. Affected modules and files
- **M0/Core:** `schemas/chat.js` (`status`, `snoozedUntil`, `awaitingReplySince`), new `schemas/quick-reply.js`, `schemas/settings.js`; `messages/append.js` (reopen on inbound, `awaitingReplySince`); `chats/repo.js` (status-aware lists), `chats/assign.js` (rules, availability, capacity); new `chats/status.js`, `quick-replies/`, `settings/`.
- **M1:** `serverless.yml` (GSIs `byAssigneeStatus`, `byStatus`; tables `QuickReplies`, `ChatReads`; snooze sweep Lambda; Phase 3 stream + search indexer).
- **M5:** `webhook.js` (automatic messages, auto-assign on new chat).
- **M7:** routes `chats/[id]/status`, `chats/[id]/read`, `quick-replies`, `settings/business-hours`, `settings/automations`, `search`.
- **M8:** `ChatList.js` (status tabs, unread, search), `Composer.js` (quick-reply picker), new `QuickRepliesAdmin.js`, `SettingsHours.js`, availability toggle in the header.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Statuses: three (open/pending/resolved) or two (open/resolved)? | **Three plus snooze.** Pending separates "waiting on us" from "waiting on them", which is what agents ask for |
| D2 | Does resolving unassign the chat? | **No.** Keep the assignee; sticky assignment brings the client back to the same agent |
| D3 | Message search engine? | **Hosted search (Typesense/Meilisearch Cloud) or OpenSearch, chosen in I2/I7 for residency.** Defer to Phase 3; chat search first |
| D4 | Snooze mechanism? | **5-minute sweep Lambda**; precise enough, one moving part |
| D5 | Default timezone? | **Workspace timezone set at signup**, defaulting from the country (e.g. `Asia/Singapore`, `Asia/Riyadh`) |
| D6 | Automatic away after inactivity? | **Yes, 15 min**, off by default for small teams |
| D7 | Chatbot / AI auto-reply? | **Not in I10.** Possible later as "AI suggested reply" for agents (human sends), which stays within Meta's AI policy and keeps a human in the loop |

## 7. Risks
- **List query rewrite:** status-aware GSIs change every list path (M4). Backfill `status = open` for existing chats before switching reads.
- **Automatic messages misfiring:** a bug can message every client. Mitigations: per-chat rate limit, a workspace kill switch, `dev` testing with a test number only.
- **Search cost and data duplication:** an extra store for message text increases cost and compliance scope. Deferred to Phase 3 for that reason.
- **Hot chat item:** status, unread and auto-reply fields all update the Chats item alongside the linked-list head. Keep per-user read state in `ChatReads`, not on the chat.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Status and focus | Open/pending/resolved + reopen on inbound; status tabs and GSIs; backfill; chat search over visible chats; unread counts and "waiting since" | M |
| 2. Speed | Quick replies (workspace + personal, `/` picker, variables); keyboard shortcuts; drafts; reply-to quoting | M |
| 3. Coverage | Business hours, away and greeting messages; auto-assign on arrival; availability and capacity; snooze sweep | M |
| 4. Scale | Message full-text search (indexer + engine); teams and team queues; reassign on inactivity | L |

## 9. Acceptance criteria
- [ ] A resolved chat leaves the agent's Open tab, and reappears in Open with the same assignee when the client writes again.
- [ ] Pending and snoozed chats return to Open at `snoozedUntil` (± 5 min).
- [ ] Typing `/ref` in the composer suggests the `/refund` quick reply; inserting it and pressing Send sends the edited text once.
- [ ] A client message outside business hours gets exactly one away message per off-hours period, labelled "Automatic" in the UI; a burst of 5 messages still yields one.
- [ ] With auto-assign on, a new chat is assigned within 5 s to an `online` agent under capacity; `away` agents are skipped.
- [ ] An agent's search never returns chats or messages from chats not assigned to them, nor from another workspace.
- [ ] Unread counts clear when the agent opens the chat and stay correct across two browser tabs.
