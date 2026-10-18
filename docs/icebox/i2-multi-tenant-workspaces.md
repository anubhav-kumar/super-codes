# I2: Multi-Tenant Workspaces

Status: Research · 2026-10-17 · Builds on: M0–M8, F3 · Unblocks: I3 (onboarding), I5 (billing) · Related: I1 (hosting), I6 (roles), I7 (residency)

## 1. Goal
Vartalap was built for one business on its own cloud (`docs/PRD.md` §What are we building). To charge many businesses without running and patching one AWS stack per customer, one deployment must serve many **workspaces**: each a paying business with its own WhatsApp number(s), users, chats and settings, strictly isolated from every other workspace. I2 adds that isolation to the data model, auth, the webhook and the sender, plus an operator console for you.

**Terms:** *workspace* (tenant) = a paying business; *customer* = the business; *client* = the WhatsApp end user (as in the rest of the docs); *operator* = you, running the service.

**Who it's for:** you (one deployment, many customers) and customers (a guarantee that no other business sees their data). **Out of scope:** WhatsApp number onboarding UX (I3), plans and payment (I5).

## 2. Current state
- **Single business baked in:**
  - One WhatsApp number per stage: the webhook loads one `WA_PHONE_NUMBER_ID` and skips payloads for any other (`services/whatsapp/src/handlers/webhook.js:16,50`; `docs/deployment.md` troubleshooting "other_phone_number_id").
  - One access token for all sends (`WA_ACCESS_TOKEN`, `services/whatsapp/serverless.yml:131`).
  - "There is one WhatsApp number for the business" (`docs/PRD.md` §Chats).
- **Keys have no tenant:** `Chats.chatId` = client phone (E.164), `Messages.messageId`, `Users.userId`, email guard `EMAIL#<email>` (`docs/arch/boilerplate.md` §4; `packages/core/src/users/repo.js:16,105`). Two businesses with the same client would **share one chat item**, and email is globally unique.
- **Scans assume one business:** the admin "All" view scans the whole Chats table (`chats/repo.js`); `listUsers` and `listActiveAgents` scan the whole Users table (`users/repo.js:193-218`); round-robin picks among all active agents.
- **Session:** the JWT holds `sub` and `role` only (`apps/web/lib/session.js:54-61`); `requireUser` loads the user (`apps/web/lib/api.js:72-81`).
- **Roles:** `admin` and `agent` (`ROLES`). Admins create admins and agents (`docs/PRD.md` §Admins). No operator role.
- **F3** already introduced opaque chat IDs (`getChatIdByPublicId` in `apps/web/lib/api.js:117-120`), which removes phone numbers from URLs, a prerequisite for safe multi-tenant routing.

## 3. Research findings
- **Tenancy models:** AWS's SaaS guidance describes *silo* (resources per tenant), *pool* (shared resources, tenant ID on every item) and *bridge/hybrid* models; pool is cheapest to operate, silo strongest for isolation and noisy-neighbour control ([AWS SaaS Lens: tenant isolation](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html), [AWS whitepaper: SaaS tenant isolation strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html)).
- **DynamoDB pool isolation:** IAM condition key `dynamodb:LeadingKeys` restricts a role's access to items whose partition key begins with a given value, which enforces tenant isolation below the application if the PK starts with the tenant ID ([DynamoDB fine-grained access control](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html)). It applies to partition keys only, and GSIs need the tenant in their partition key too.
- **WhatsApp routing:** every webhook payload carries `metadata.phone_number_id` and the WABA ID in `entry[].id`, so one webhook can route payloads to workspaces. Meta also supports **webhook overrides** per WABA or phone number, meant for partners giving each customer its own endpoint ([Meta: Webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)).
- **Tokens per customer:** a Tech Provider gets a *business integration system user token* per onboarded customer through Embedded Signup (I3; [Meta: Onboarding customers as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider)). Sends for a workspace must use that workspace's token.
- **Messaging limits are per business portfolio** since 2025-10-07 and shared by all numbers in it ([Meta: Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)). One workspace's template blast cannot consume another's limit, but within a workspace, numbers share it.

## 4. Proposed design

### 4.1 Tenancy model
| Option | How | Verdict |
|---|---|---|
| (a) **Pool: shared tables, `workspaceId` leads every key** | One stack per stage; isolation in keys, code and IAM `LeadingKeys` | **Recommended default** |
| (b) Silo: one stack per customer (today's model) | `serverless deploy --stage <customer>` | Kept as a premium "dedicated" offer (data residency, own AWS account). Same code, a stack with one workspace |
| (c) Pool with per-tenant tables | Table per workspace | Rejected: table limits per account, migrations × N |

Option (a) with (b) available means the code is always multi-tenant; a dedicated stack is simply a pool with one workspace.

### 4.2 Data model
New table **`Workspaces`** (PK `workspaceId` = `w_` + ULID):
`name`, `slug`, `status` (`trial` | `active` | `past_due` | `suspended` | `closed`), `plan` (I5), `timezone`, `country`, `region` (I7), `createdAt`, `settings` (I10 hours, automations, notification defaults), `limits` (seats, numbers).

New table **`WaNumbers`** (PK `phoneNumberId`): `workspaceId`, `wabaId`, `displayPhoneNumber`, `verifiedName`, `status`, `qualityRating`, `tokenRef` (pointer to the secret, I6), `connectedAt`. GSI `byWorkspace`. This is the webhook's routing table.

Key changes (one migration, done before the first second customer):
| Table | Today | With I2 |
|---|---|---|
| Chats | PK `chatId` = phone | PK `chatId` = `<workspaceId>#<phoneNumberId>#<E.164>`; attributes `workspaceId`, `phoneNumberId`, `clientPhone`; `publicId` unchanged (globally unique) |
| Messages | PK `messageId` | PK `messageId` unchanged (ULIDs after F3 Phase 2); new attribute `workspaceId`; `chatId` follows the new chat key |
| Users | PK `userId`, email guard `EMAIL#<email>` | Users stay global (one login per person); new **`Memberships`** items: PK `userId`, SK `workspaceId`, with `role`, `active`, `lastAutoAssignedAt`. GSI `byWorkspace` (PK `workspaceId`, SK `userId`) |
| GSI `byAssignee` | PK `assignedTo` | PK `workspaceId#assignedTo` (the `UNASSIGNED` queue becomes per workspace) |
| GSI `byPublicId` | `publicId` | unchanged; the resolved chat's `workspaceId` must match the session's |
| New GSI `byWorkspace` on Chats | — | PK `workspaceId`, SK `lastMessageAt`: replaces the full-table Scan for the admin "All" view |

- A client who messages two businesses gets two separate chats, by key.
- The chat key includes `phoneNumberId` so one workspace can run several numbers (for example sales and support) without merging conversations (D3).

### 4.3 Request context and access
- **Session:** the JWT gains `wid` (the active workspace). `requireUser` loads the membership for (`userId`, `wid`) and returns `{ user, workspace, role }`; inactive membership or a non-`active`/`trial`/`past_due` workspace → `UNAUTHENTICATED`/`FORBIDDEN` (`past_due` gets a banner, `suspended` read-only, D5).
- **Every core function takes `workspaceId`** as its first argument (repo functions, `appendMessage`, assignment, views). There are no "global" list functions left except operator tools.
- **`loadChatFor`** additionally checks `chat.workspaceId === ctx.workspaceId`; a mismatch is treated as a missing chat (agents `FORBIDDEN`, admins `NOT_FOUND`), so a leaked `publicId` from another workspace reveals nothing.
- **Users in several workspaces** (an agency or a consultant): a workspace switcher in the header re-issues the session with another `wid`.
- **Defence in depth:** the web task role (I1) keeps full table access (the app needs it), but each request uses a DynamoDB client wrapper that asserts `workspaceId` on every key and condition. A later hardening step can issue per-request scoped credentials with `dynamodb:LeadingKeys` (Phase 4, D6).

### 4.4 Webhook and sender
- **Webhook:** look up `metadata.phone_number_id` in `WaNumbers` (cached 60 s). Unknown number → log `item_skipped` and still `200`. Signature check uses the **app secret** of our Meta app (one app for all customers, I3), so it stays global.
- **Sender:** the SQS body adds `workspaceId` and `phoneNumberId`; `MessageGroupId` stays per chat. The sender loads the token for that number (I6 secret storage), and sends from that `phoneNumberId`.
- **Per-workspace fairness:** one SQS FIFO queue shared by all workspaces is fine at small scale since groups are per chat. Add per-workspace send rate limiting once template broadcasts exist (F5), so one customer's campaign can't starve others' replies.

### 4.5 Operator console (you)
- A separate `operator` role, not a workspace role, with its own login and mandatory MFA (I6).
- Lists workspaces with status, plan, numbers, seats, last activity and health (I9 metrics).
- Actions: suspend/reactivate, extend trial, change plan limits, re-run onboarding checks, view usage.
- **Support access to customer data** is off by default: a workspace admin grants time-boxed access (e.g. 72 h) from settings; every operator read during that time goes to the customer-visible audit log (I6). This is what a DPA (I7) will promise.

### 4.6 Workspace lifecycle
- **Create:** signup (I5 trial) creates a workspace, the first admin membership and default settings.
- **Invite:** admins invite by email; invitees set a password or join with SSO (I6). Replaces "admins create users with a password" for multi-tenant use.
- **Close:** export (I7), then delete all items for the `workspaceId` after the grace period (I7 retention); disconnect numbers from our app (I3).

### 4.7 Migration of the current single-business data
- Create workspace `w_<ulid>` for the trial business; re-key chats and messages with a script (expand → copy → switch reads → contract), or reset `dev` data if it is trial-only (as F3 D7 did).
- `scripts/seed-admin.js` gains `--workspace "<name>"`; a new `scripts/create-workspace.js` exists for dedicated stacks.

## 5. Affected modules and files
- **M0/Core (most of the change):** every module under `packages/core/src/` takes `workspaceId`; new `workspaces/`, `memberships/`, `wa-numbers/`; `schemas/*` (workspace, membership, wa-number; `workspaceId` on chat and message); `access.js` (workspace check); `chats/repo.js` (GSI changes, no Scan); `users/repo.js` (global users + memberships; round-robin per workspace).
- **M1:** `services/whatsapp/serverless.yml` (tables `Workspaces`, `WaNumbers`, `Memberships`; new and changed GSIs; webhook and sender IAM for `WaNumbers` and secrets).
- **M5/M6:** `webhook.js` (routing by `phone_number_id`), `sender.js` (per-number token and sender ID), `src/lib/params.js` (per-number secrets).
- **M7:** `apps/web/lib/session.js` (`wid` claim), `lib/api.js` (`requireUser` returns context; workspace check), every route handler passes `ctx.workspaceId`; new routes `workspaces/switch`, `invitations`, `operator/*`.
- **M8:** workspace switcher, invite flow, operator console pages.
- **Scripts:** `seed-admin.js`, new `create-workspace.js`, `migrate-to-workspaces.js`.
- **Docs:** `PRD.md` (multi-business), `arch/boilerplate.md` §4–§5, M0, M3, M4, `deployment.md`.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Pool, silo or both? | **Pool by default, dedicated stack as a premium plan** (same code) |
| D2 | Can one person belong to several workspaces? | **Yes** (memberships), with a switcher; needed for agencies and for your own support access |
| D3 | Several WhatsApp numbers per workspace? | **Yes, data model now; UI in I3 Phase 2.** Plan limits decide how many (I5) |
| D4 | Can an operator read customer chats? | **Only with a time-boxed grant from the workspace admin**, audited and visible to the customer |
| D5 | What happens when a workspace is `past_due` or `suspended`? | **`past_due`: full access with a banner for 14 days. `suspended`: read-only, no sends, inbound still stored** (never drop customers' clients' messages) |
| D6 | Enforce isolation with IAM `LeadingKeys` per request? | **Not in Phase 1** (code-level guard + tests); add in Phase 4 before enterprise customers |
| D7 | Migrate trial data or reset? | **Migrate** if the trial business becomes customer #1; otherwise reset |

## 7. Risks
- **Cross-tenant leak** is the worst possible bug for a SaaS. Mitigations: `workspaceId` as the first argument of every core function, a guard in the DB wrapper, an isolation test suite (two workspaces, same client phone, every route), and the `publicId` workspace check.
- **Large, risky migration** touching every key and GSI, including M2's linked-list append. Do it once, before customer #2, with M2's concurrency checks re-run.
- **Noisy neighbour:** one workspace's volume (broadcasts, F5) can delay others' sends in the shared queue. Mitigated by per-workspace rate limits; a separate queue for broadcasts.
- **Hot partitions** on `workspaceId#UNASSIGNED` for a very busy workspace: acceptable at expected volumes; shard if needed.
- **Dedicated stacks drift** from the pool version. Mitigation: the same pipeline (I1) deploys every stack from the same release tag.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Data model and context | `Workspaces`, `Memberships`, `WaNumbers` tables; re-keyed Chats/Messages and GSIs; `workspaceId` through core, access checks, views, sessions; migration script | L |
| 2. Routing | Webhook routing by `phone_number_id`; sender per-number token and sender ID; per-workspace round-robin | M |
| 3. Lifecycle and console | Invitations; workspace switcher; operator console; suspend/close flows; support-access grants | M |
| 4. Hardening | Isolation test suite in CI; per-workspace send rate limits; optional IAM `LeadingKeys` scoped credentials | M |

## 9. Acceptance criteria
- [ ] Two workspaces on the same stage, each with its own number, both receive messages from the **same** client phone: each sees only its own chat, and neither chat's messages appear in the other.
- [ ] Every API route called with workspace A's session and a `publicId`, `userId` or `noteId` from workspace B returns the same error as a missing object.
- [ ] The admin "All" view no longer scans the whole Chats table (no `Scan` in `chats/repo.js`).
- [ ] Round-robin auto-assign picks only agents of the chat's workspace.
- [ ] A reply from workspace A is sent with A's phone number ID and token (verified in sender logs by `phoneNumberId`, not by number).
- [ ] An operator without a grant gets `403` on workspace chats; with a grant, each access is in that workspace's audit log.
- [ ] A suspended workspace still stores inbound messages and cannot send.
