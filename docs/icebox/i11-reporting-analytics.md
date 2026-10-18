# I11: Reporting and Analytics

Status: Research · 2026-10-17 · Builds on: M2, M4, M7 · Depends on: I10 (status, `awaitingReplySince`), I2 (workspaces) · Related: F5 (template spend), I5 (usage)

## 1. Goal
The person who signs the invoice is usually a manager, not an agent. They renew if they can see that customers get answered quickly and that the team is pulling its weight. I11 gives admins a reporting page: message and conversation volumes, first-response and resolution times, per-agent workload and performance, delivery failures, and template spend, with CSV export.

**Who it's for:** admins (and a future "manager" read-only role, I6). Agents see only their own numbers (D2). **Out of scope:** product analytics about how staff use the UI (that is our own telemetry, not a customer feature), and BI-tool integrations (I12 API covers raw export).

## 2. Current state
- **No reporting.** Data needed exists only partly:
  - `Messages`: `direction`, `senderType`, `senderId`, `status`, `errorCode`, `createdAt` per message (`docs/arch/boilerplate.md` §4.1). Messages are keyed by `messageId` and linked per chat; there is no index by time or by agent.
  - `Chats`: `assignedTo`, `lastClientMessageAt`, `lastMessageAt`. No assignment history, no resolution time (I10 adds status).
- Any report today would need a full Scan of Messages, which costs read capacity proportional to all history and grows forever.
- **Assignment history is not kept:** `assignChat` overwrites `assignedTo` (`packages/core/src/chats/assign.js`). Who handled a chat before is lost, so per-agent credit after reassignment can't be computed.

## 3. Research findings
- **Standard support metrics** (definitions used across Zendesk, Intercom and similar; vendor docs, summarised):
  - *First response time (FRT):* from the first client message of a conversation to the first human reply.
  - *Resolution time:* from opening to resolved.
  - *Response time (each):* from each client message that needs a reply to the next human reply.
  - Business-hours variants exclude time outside configured hours (I10 §4.5).
- **Computing from events, not scans:** DynamoDB Streams deliver every item change to a Lambda in order per partition key, with 24-hour retention ([DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)). Aggregating on write into daily counters avoids scanning history. Atomic `ADD` on number attributes makes counters safe under concurrency ([update expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html)).
- **Raw export for heavy analysis:** DynamoDB export to S3 (requires PITR) produces DynamoDB JSON or Ion files that Athena can query, without consuming table read capacity ([Export to S3](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/S3DataExport.HowItWorks.html)).
- **Meta-side data:** the WhatsApp Business Management API exposes pricing and conversation analytics per WABA ([Meta: Analytics](https://developers.facebook.com/docs/whatsapp/business-management-api/analytics)). **Unverified:** current field names after the July 2025 per-message pricing change; check before building §4.5.

## 4. Proposed design

### 4.1 Event capture
- New, append-only `ChatEvents` items (in a new `Events` table, PK `workspaceId#chatId`, SK `ts#eventId`): `assigned` (from, to, by), `status_changed` (from, to, by), `first_response`, `message_in`, `message_out` (senderType, senderId), `send_failed` (errorCode). Written in the same transaction as the change where cheap (assign, status), or by a Streams consumer for messages.
- This also fixes the lost assignment history and gives I6's audit log a natural source for chat actions (audit stays its own table; see I6).

### 4.2 Aggregation
- A Streams consumer on Messages, Chats and Events updates daily rollups in a `Stats` table:
  - PK `workspaceId#day` (`2026-10-17` in the workspace timezone), SK `all` or `agent#<userId>`.
  - Counters: `inbound`, `outbound`, `outboundByAdmin`, `automatic`, `failed`, `newChats`, `resolved`, `reopened`, `frtCount`, `frtSumSec`, `frtBuckets` (e.g. `<5m`, `<15m`, `<1h`, `<4h`, `≥4h`), `resolutionSumSec`, `templatesSent` by category.
  - Percentiles are approximated from buckets (exact p50/p90 isn't needed for a dashboard).
- Each event is applied idempotently: the consumer records `eventId` in a short-TTL `Processed` item and skips duplicates (Streams retry on Lambda error).
- A nightly job re-computes the previous day from `Events` to correct any drift (D4).

### 4.3 Reports (admin UI, `/reports`)
| Report | Contents |
|---|---|
| Overview | New chats, messages in/out, open now, unassigned now, median FRT, resolved, failed sends. Date range picker (today, 7 d, 30 d, custom ≤ 365 d) and comparison with the previous period |
| Response times | FRT and resolution distributions; by hour of day and day of week (heatmap); business-hours toggle |
| Agents | Per agent: chats handled, messages sent, median FRT, resolved, currently open, availability time (I10). Sorted table, no ranking badges (D3) |
| Delivery | Sent/delivered/read/failed rates; failures by `errorCode` with the meaning (e.g. `131047` window closed, `131026` undeliverable) |
| Templates (after F5) | Sends by template and category, delivery and read rates, estimated Meta cost |

- Charts follow the repo's UI style (F1); all numbers have a CSV export of the same rows.
- Times are shown in the workspace timezone with ISO dates.

### 4.4 Agent self-view
- An agent sees their own figures for the last 7/30 days (chats handled, median FRT). They never see others' figures (D2).

### 4.5 Usage figures for billing (I5)
- The same rollups feed I5's usage display: active users, conversations, template sends. One source of truth avoids disputes over invoices.

### 4.6 Privacy
- Reports contain counts and durations only, never message text, client names or phone numbers. CSV exports carry agent names and IDs, which is employee personal data: admin-only, and each export is written to the audit log (I6).
- Per-agent performance monitoring can fall under employee-monitoring rules in some jurisdictions; the customer (as controller of its staff data) decides whether to enable the Agents report (D3).

## 5. Affected modules and files
- **M1:** `serverless.yml` (tables `Events`, `Stats`; Streams on Messages and Chats; aggregator Lambda; nightly recompute schedule).
- **Core:** new `packages/core/src/events/` (write helpers), `stats/` (rollup update and read); `chats/assign.js` and I10's `chats/status.js` write events.
- **New service code:** `services/whatsapp/src/handlers/aggregate.js`, `recompute.js`.
- **M7:** `app/api/reports/*` (overview, response-times, agents, delivery, templates; `?from&to&format=csv`).
- **M8:** `app/(staff)/reports/` pages and chart components.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Which plan includes reports? | **Overview and Delivery on all plans; Response times, Agents and CSV on the Business plan** (I5) |
| D2 | Do agents see colleagues' numbers? | **No.** Own numbers only |
| D3 | Ship the per-agent report on by default? | **Yes, with a workspace setting to turn it off**, and a note in the DPA that the customer controls staff monitoring |
| D4 | Exact or approximate percentiles? | **Approximate from buckets**, with a nightly recompute for counts. Exact figures available via the I12 export |
| D5 | Data retention for `Events` and `Stats`? | **Events follow message retention (I7); daily `Stats` kept 25 months** (year-on-year comparison) since they hold no client personal data |

## 7. Risks
- **Double counting** from Streams retries or replays: mitigated by event IDs and the idempotency record, and corrected nightly.
- **Backfill:** history before I11 has no events. Offer reports from the go-live date only, or a one-off Scan-based backfill per workspace at a quiet hour (D-item for the rollout).
- **Timezone boundaries:** rollups by day in the workspace timezone; changing the timezone later misaligns old days. Store `day` with the timezone used and recompute on change (rare).
- **Hot partitions:** a busy workspace writes the same `workspaceId#day` item many times per second. Mitigate with per-hour SK sharding if a workspace exceeds a few hundred messages a minute.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Events | `Events` table; assignment and status events; Streams consumer for messages; idempotency | M |
| 2. Rollups and overview | `Stats` table; Overview and Delivery reports; CSV | M |
| 3. Performance | FRT/resolution with buckets; business-hours variant; Agents report; agent self-view; nightly recompute | M |
| 4. Templates and usage | Template report (after F5); usage feed for I5 | S |

## 9. Acceptance criteria
- [ ] On a seeded `dev` workspace, Overview counts match a manual count of messages and chats for the same day exactly.
- [ ] Reassigning a chat from A to B is visible in the chat's history (`assigned` events) and credits each agent only with the messages they sent.
- [ ] FRT for a scripted conversation (client at 10:00, agent at 10:07) lands in the `<15m` bucket and shows a 7-minute median when it is the only one.
- [ ] Re-delivering a Streams batch does not change any counter.
- [ ] No report or CSV contains message text, client names or phone numbers.
- [ ] An agent calling an admin report route gets `403`; their own self-view works.
