# I9: Reliability, Observability and Support Operations

Status: Research · 2026-10-17 · Builds on: M1, M5, M6, M7, M9 · Related: I1 (hosting), I7 (backups)

## 1. Goal
A paying customer expects every WhatsApp message to arrive, to be told quickly when something breaks, and to get help from someone who can see what went wrong. Today a failure is only visible if someone tails CloudWatch logs. I9 makes Vartalap operable as a service: no silent message loss, alarms that page the operator, dashboards, error tracking, backups that can be restored, a runbook, and a support path with a stated service level.

**Who it's for:** the operator (you, on call) and, indirectly, every paying workspace. **Out of scope:** customer-facing analytics (I11) and real-time UI updates (I8).

## 2. Current state
- **Silent inbound loss (bug):** when `appendMessage` throws for an inbound message (DynamoDB throttling, a transaction that exhausts its 5 retries, a bad item), the webhook logs `message_failed`, increments `counts.failed` and **still returns `200`** (`services/whatsapp/src/handlers/webhook.js:82-90,120`). Meta treats `200` as delivered and never retries, so the message is lost. The same applies to `status_failed`.
- **Outbound:** retried 3 times by SQS, then moved to the DLQ. The message is marked `failed` on the last attempt (`docs/arch/boilerplate.md` §5.3). There is **no alarm** on DLQ depth (`services/whatsapp/serverless.yml:317-335`).
- **Logs:** the Lambdas write JSON lines with `level` and `msg` (`webhook.js:139`). The web app uses `console.error` with masked paths (`apps/web/lib/api.js:26`). Retention is 14 days for the Lambdas (`serverless.yml:37`). The web app's logs go to the developer's terminal (localhost, see I1).
- **No metrics, alarms, dashboards, tracing or error tracking.** No request IDs connect a UI send → API → SQS → sender → Meta status callback.
- **Data safety:** tables have no `PointInTimeRecoverySpecification` and no `DeletionProtectionEnabled` (`serverless.yml:250-315`). `serverless remove` deletes the tables and their data (`services/whatsapp/README.md:48`).
- **Runbook:** M9 asks for `docs/runbook.md` (`docs/modules/m9-e2e.md` step 5). It doesn't exist yet. `docs/deployment.md` §7 and its troubleshooting table cover part of it.
- **Health:** no health endpoint. Nothing detects a webhook that Meta has stopped calling (for example after the app secret changes or the subscription drops).
- **Tests and CI:** no automated test suite or CI pipeline in the repo. Verification is manual (M9 scenarios).

## 3. Research findings
- **Meta webhook retries:** Meta retries a webhook that doesn't get a `200` with decreasing frequency, for up to 7 days, and retries can produce duplicates, so processing must be idempotent ([Meta: Webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), checked 2026-10-17). Returning non-`200` on a storage failure is therefore safe: dedup on the message ID (M2, F3 Phase 2) absorbs the replay. Payloads can be up to 3 MB.
- **SQS/Lambda:** a DLQ alarm on `ApproximateNumberOfMessagesVisible > 0` is the standard pattern ([AWS: Amazon SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html); [CloudWatch metrics for SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-available-cloudwatch-metrics.html)). `ApproximateAgeOfOldestMessage` on the main queue catches a stuck sender.
- **Structured logs and metrics without extra infra:** CloudWatch Embedded Metric Format turns a JSON log line into a metric ([EMF](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html)). Powertools for AWS Lambda (TypeScript/JavaScript) provides Logger, Metrics and Tracer for Node ([Powertools](https://docs.powertools.aws.dev/lambda/typescript/latest/)); it works from plain JavaScript.
- **Lambda log level control:** Lambda supports JSON log format and application log-level filtering natively ([Lambda advanced logging controls](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-advanced.html)).
- **Synthetic checks:** CloudWatch Synthetics canaries can call an HTTP endpoint on a schedule ([Synthetics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Canaries.html)).
- **DynamoDB backups:** PITR restores to any second in the recovery window into a **new** table. Since January 2025 the window is configurable per table from 1 to 35 days (default 35), at the same price ([PITR](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html)). AWS Backup can add longer, cross-region copies. Deletion protection blocks table deletes ([deletion protection](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.Basics.html#WorkingWithTables.Basics.DeletionProtection)).
- **Error tracking:** Sentry's Next.js and AWS Lambda Node SDKs capture exceptions with release and environment tags ([Sentry Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/), [Sentry AWS Lambda](https://docs.sentry.io/platforms/javascript/guides/aws-lambda/)). It must be configured to scrub request bodies and phone numbers (§4.6).

## 4. Proposed design

### 4.1 No silent message loss (Phase 1, do first)
- **Webhook:** if any inbound message or status fails to store, return `500` after processing the rest. Meta replays the whole payload; items already stored dedup as `duplicate`. Keep the per-item `try/catch` so one bad item doesn't block the others.
- **Poison payloads:** a payload that fails for a non-transient reason (validation) would retry for days. Classify errors: `AppError('VALIDATION')` and parse errors → log `message_rejected`, count it, still `200`. Everything else → `500`.
- **Optional, stronger (Phase 3):** the webhook verifies the signature, writes the raw body to an SQS "inbound" queue and returns `200` at once. A consumer Lambda stores messages, with its own retries and DLQ. This decouples Meta from DynamoDB hiccups and keeps the webhook well under Meta's timeout. It also gives a replay tool for free (redrive the inbound DLQ).
- **Sender:** keep the current behaviour. Add the reason (`errorCode`, retryable or not) to the `failed` status, and stop retrying codes that are final (for example `131047` window closed, `131026` undeliverable) so they fail on the first attempt.

### 4.2 Correlation IDs
- The API generates a `requestId` (ULID) per request, returns it in an `x-request-id` header and logs it.
- `POST …/messages` stores `requestId` on the outbound message and puts it in the SQS message attributes. The sender logs it with `messageId` and `waMessageId`.
- Support can then trace one message from the browser to Meta's response by a single ID shown in the UI's "Failed" tooltip.

### 4.3 Metrics and alarms
Emitted through EMF from the existing JSON log lines (no new SDK in Phase 1). Per stage, and per workspace once I2 exists (as a dimension only for low-cardinality metrics).

| Metric | Source | Alarm |
|---|---|---|
| `InboundStored`, `InboundDuplicate`, `InboundFailed` | webhook | `InboundFailed > 0` for 5 min → page |
| `WebhookBadSignature` | webhook | `> 10` in 5 min → warn (wrong secret or probing) |
| `InboundSilence` | webhook (no `InboundStored` in N hours) | per workspace, N from its normal traffic (default 6 h in business hours) → warn |
| `OutboundSent`, `OutboundFailed` by `errorCode` | sender | failure rate `> 5 %` over 15 min → page |
| DLQ `ApproximateNumberOfMessagesVisible` | SQS | `> 0` → page |
| Outbound queue `ApproximateAgeOfOldestMessage` | SQS | `> 120 s` → page |
| Lambda `Errors`, `Throttles`, `Duration p99` | Lambda | errors `> 1 %`; duration `> 80 %` of timeout |
| DynamoDB `ThrottledRequests`, `SystemErrors` | DynamoDB | `> 0` for 5 min → warn |
| API 5xx rate, p95 latency | web app (I1 host) | 5xx `> 2 %` over 5 min → page |
| Meta token check | daily canary calling `GET /{phone-number-id}` | any non-200 → page (catches expired or revoked tokens before a send fails) |

- **Routing:** CloudWatch alarm → SNS topic → email plus a paging tool (PagerDuty/Opsgenie or a Slack/Telegram webhook to start; open decision D3).
- **Dashboard:** one CloudWatch dashboard per stage with the metrics above. It is defined in `serverless.yml` so every stage gets the same one.

### 4.4 Error tracking
- Sentry (or an equivalent) in the web app (client and server) and both Lambdas, tagged with `stage`, `release` (git SHA) and `workspaceId` (I2).
- `beforeSend` scrubs request bodies, cookies, `Authorization` headers and any digit run of 5+ (reuse `maskDigits`). Message text and phone numbers must never leave AWS (M-series rule; F3).
- Sentry's data region should match the data-residency promise (I7 D-items). If that can't be met, use CloudWatch only.

### 4.5 Health and synthetic checks
- `GET /api/health` (no auth): checks SSM config loaded and a cheap DynamoDB `DescribeTable` (cached 30 s). Returns `{ status, version }` only, no internals.
- A CloudWatch Synthetics canary every 5 min: `/api/health`, the login page, and the webhook `GET` verification with a wrong token (expects `403`, proving the Lambda is up without needing the secret).
- Public status page (hosted service, for example Instatus or Atlassian Statuspage) fed from the same checks, plus manual incident posts. Linked from the app footer.

### 4.6 Logging policy (formalised)
- One JSON shape everywhere: `{ ts, level, msg, requestId, workspaceId, userId?, chatPublicId?, messageId?, … }`.
- Never: message text, note bodies (F4), template variables (F5), full phone numbers, tokens, cookies, request bodies. The existing rule ("Do not log message bodies or full phone numbers", `docs/modules/README.md`) becomes a lint-able helper (`log()` in core with an allow-list of field names).
- Retention: 30 days for application logs (raise from 14), 1 year for the audit log (I6). Open decision D4.

### 4.7 Backups and disaster recovery
- Turn on `DeletionProtectionEnabled: true` on every table in `prod`.
- PITR on Messages, Chats and Users in `prod` (I7 decides the erasure trade-off and the recovery window).
- A documented, rehearsed restore: PITR → new table → swap the SSM config name (the web app reads table names from SSM, so a restore needs no redeploy of the web app, only of the Lambdas, which read names from env).
- Targets (open decision D2): RPO ≤ 5 min (PITR), RTO ≤ 4 h for a full-table restore.
- `serverless remove` on `prod` is blocked by deletion protection; the runbook says so.

### 4.8 Runbook and support
- Write `docs/runbook.md` (closes M9 step 5) with one section per alarm: what it means, how to check, how to fix, how to tell the customer. Include: DLQ redrive, token rotation, webhook re-subscription, restoring a table, rolling back a release (I1), and a Meta outage (check the [Meta status page](https://metastatus.com/)).
- **Support channel for customers:** a support email and an in-app "Help" link that pre-fills workspace ID, user ID, browser and the last `requestId` (no message content).
- **Service level (offer in the plan, I5):** for example, 99.5 % monthly availability for the web app and API, a first response within 1 business day (Starter), 4 business hours (Business). Meta's own availability is excluded. Open decision D1.
- **Incident process:** severity levels, a status page post within 30 min for Sev-1, a post-mortem within 5 business days. Personal-data breaches follow I7's breach procedure (GDPR 72 h, PDPA 3 calendar days).

### 4.9 Automated checks and CI (with I1)
- CI runs lint, a production build of the web app and `serverless package` on every PR.
- A small automated suite for the highest-risk code (M2 linked-list append and dedup, access rules, window check, F3 views) runs in CI against DynamoDB Local or a throwaway stage. Open decision D5, since today verification is manual by choice.
- A scripted M9 smoke test (signed fake webhook → chat appears → send → `failed` with the dummy token) runs after every deploy to `staging`.

## 5. Affected modules and files
- **M5:** `services/whatsapp/src/handlers/webhook.js` (return code on failure, error classification, metrics, request IDs); optional new `inbound-consumer.js` (Phase 3).
- **M6:** `services/whatsapp/src/handlers/sender.js` (final vs retryable codes, request ID, metrics).
- **M1:** `services/whatsapp/serverless.yml` (alarms, SNS topic, dashboard, canary, PITR, deletion protection, log retention, optional inbound queue and DLQ).
- **Core:** new `packages/core/src/log.js` (shared logger with field allow-list), `errors.js` (retryable classification).
- **M7:** `apps/web/lib/api.js` (`withHandler` adds `requestId`, uses the shared logger), new `app/api/health/route.js`, Sentry config files.
- **M8:** failed-message tooltip shows `requestId`; Help link.
- **Docs:** new `docs/runbook.md`; `docs/deployment.md` §7; `docs/modules/m9-e2e.md`.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | What availability and support response do we promise? | **99.5 % monthly** for the web app and API (excluding Meta), support response in 1 business day (Starter) / 4 business hours (Business). Raise only after 3 months of measured uptime |
| D2 | Backup targets? | **RPO 5 min, RTO 4 h**, PITR on all prod tables, restore rehearsed once per quarter |
| D3 | Paging tool? | **Start with SNS → email + a Slack or Telegram webhook.** Move to PagerDuty/Opsgenie when there is more than one person on call |
| D4 | Log retention? | **30 days** application logs, **1 year** audit log (I6) |
| D5 | Add an automated test suite to CI? | **Yes, narrow:** M2 append/dedup, access rules, window check and F3 views only. These are the parts where a regression loses or leaks data |
| D6 | Inbound queue (§4.1 Phase 3)? | **Yes, before the 10th workspace.** It isolates Meta from storage incidents |
| D7 | Error tracking vendor? | **Sentry**, EU or US region matching I7's residency decision, with strict scrubbing. Fall back to CloudWatch only if residency can't be met |

## 7. Risks
- **Replay storms:** returning `500` makes Meta replay whole payloads. Dedup handles correctness, but a persistent failure (for example a broken deploy) means repeated load for hours. Mitigation: the poison-payload classification and the inbound queue (Phase 3).
- **Alarm fatigue:** too many warn-level alarms get ignored. Start with the five page-level alarms only.
- **Third-party scrubbing gaps:** an error tracker can capture message text from a stack variable or breadcrumb. Mitigation: `beforeSend` scrubbing, disable breadcrumbs for fetch bodies, review the first 100 events by hand.
- **Restore swaps:** a PITR restore creates a new table name. Lambdas read names from env (redeploy needed) while the web app reads SSM. The runbook must cover both, and the restore must be rehearsed.
- **Per-workspace dimensions** can explode CloudWatch metric costs. Use them only on low-cardinality metrics, and use logs insights queries for the rest.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Stop the bleeding | Webhook returns `500` on storage failure with error classification; DLQ and queue-age alarms; Lambda error alarms; SNS → email/chat; PITR + deletion protection on prod; log retention 30 days | S |
| 2. See and trace | Shared logger with allow-list; request IDs end to end; EMF metrics and dashboard; Sentry with scrubbing; `/api/health`; canaries incl. the daily Meta token check; `docs/runbook.md` | M |
| 3. Harden | Inbound SQS queue + consumer Lambda; final vs retryable error codes in the sender; status page; restore rehearsal; CI smoke test after deploy | M |
| 4. Support | Help link with context; SLA in plans (I5); incident and post-mortem template | S |

## 9. Acceptance criteria
- [ ] Forcing `appendMessage` to fail (for example, a deny on `PutItem` on `dev`) makes the webhook return `500`. After removing the deny, Meta's replay (or a re-sent signed test payload) stores the message exactly once.
- [ ] A message put in the outbound DLQ triggers an alarm notification within 5 minutes.
- [ ] A broken `WA_ACCESS_TOKEN` is caught by the daily token canary before any customer send fails.
- [ ] One `requestId` shown on a failed message in the UI finds the matching API log line, SQS attribute and sender log line.
- [ ] No log line or error-tracker event contains message text or a full phone number (search a day of `dev` logs and Sentry events for a known test number and a known message string).
- [ ] `prod` tables have PITR and deletion protection on, and a restore to a new table has been rehearsed and timed against the RTO.
- [ ] `docs/runbook.md` has a section for every page-level alarm, and someone other than the author has followed it once.
