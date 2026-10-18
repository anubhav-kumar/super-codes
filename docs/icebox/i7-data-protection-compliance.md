# I7: Data Protection and Compliance (Retention, Export, Erasure, Residency, Legal Pack)

Status: Research · 2026-10-17 · Builds on: M1, M2, M4 · Depends on: I2 (workspaces) · Related: F3 (phone hiding), F4 (notes), F2 (media), I6 (audit, secrets), I9 (backups, breach process)

## 1. Goal
The PRD deferred "data retention, client data deletion, encryption-at-rest choices and log masking … before this moves beyond a trial, given GDPR, Singapore PDPA and Saudi PDPL" (`docs/PRD.md` §Deferred). Charging other businesses is exactly that move. Each customer is the **controller** of its clients' data and Vartalap is its **processor**; customers will need a Data Processing Agreement, answers on where data lives, and working tools to answer access and deletion requests from their clients. I7 delivers those tools and the documents that go with them.

**Who it's for:** workspace owners/admins (compliance tasks), their clients (rights honoured), you (contractual and legal exposure). **Not legal advice:** every legal point below needs confirmation by counsel in the relevant jurisdictions.

## 2. Current state
- **Personal data held:** client phone numbers (chat key), WhatsApp profile names, full message history (text; media with F2), statuses and timestamps (`docs/arch/boilerplate.md` §4); F4 adds free-text notes; staff names and emails in Users.
- **Retention:** none. Everything is kept forever; no TTL on any table (`services/whatsapp/serverless.yml:250-315`).
- **Erasure and export:** none. Deleting a client means hand-editing DynamoDB; the linked list (`prevMessageId`) makes deleting individual messages non-trivial (M2).
- **Encryption at rest:** DynamoDB default (AWS-owned key); secrets are SSM `String` (I6 §2).
- **Logs:** no message bodies, phone numbers reduced to the last 4 digits (`docs/deployment.md` §7; `apps/web/lib/api.js:22`). Good, and I9 formalises it.
- **Residency:** one region per stage, default `ap-south-1` (Mumbai) (`docs/arch/boilerplate.md` §9.3).
- **Backups:** none (I9 adds PITR, which interacts with erasure).
- **No legal documents:** no terms of service, privacy notice, DPA, sub-processor list, or security overview.

## 3. Research findings
- **GDPR** ([gdpr-info.eu](https://gdpr-info.eu)):
  - Art. 28: controller–processor contract (DPA) with mandatory terms: processing only on instructions, confidentiality, security, sub-processor approval, assistance with data-subject rights and breaches, deletion or return at the end, audits ([Art. 28](https://gdpr-info.eu/art-28-gdpr/)).
  - Art. 15 access (respond within one month), Art. 17 erasure, Art. 20 portability in a structured, machine-readable format ([15](https://gdpr-info.eu/art-15-gdpr/), [17](https://gdpr-info.eu/art-17-gdpr/), [20](https://gdpr-info.eu/art-20-gdpr/)).
  - Art. 30 records of processing (processors keep their own), Art. 33 breach notification to the authority within 72 h (processor must notify the controller without undue delay) ([30](https://gdpr-info.eu/art-30-gdpr/), [33](https://gdpr-info.eu/art-33-gdpr/)).
- **Singapore PDPA:** a breach is notifiable if significant harm is likely or 500+ individuals are affected; notify the PDPC within **3 calendar days** of assessing it as notifiable, and affected individuals where significant harm is likely ([PDPC: report a data breach](https://www.pdpc.gov.sg/organisations/e-services/report-your-organisations-data-breach)). Data intermediaries (processors) must notify the organisation without undue delay.
- **Saudi PDPL (unverified, secondary sources):** fully enforceable from **2024-09-14**; transfers outside the Kingdom without an adequacy decision need safeguards such as standard contractual clauses, binding corporate rules or certification, under SDAIA's transfer regulation (updated 2024-09-01). No adequacy list was found. Confirm with counsel ([sdaia.gov.sa](https://sdaia.gov.sa)).
- **DynamoDB mechanics:**
  - **TTL** deletes expired items with no guaranteed timing (typically within a few days, can exceed 48 h), and expired items still appear in reads until deleted, so reads must filter them ([TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)).
  - **Encryption at rest** is always on; the default is an AWS-owned key, switchable at any time to an AWS-managed or customer-managed KMS key ([encryption at rest](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html)).
  - **PITR** keeps a restorable copy for the configured window (1–35 days); erased data stays restorable until the window passes ([PITR](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html)).
- **Meta as a separate party:** WhatsApp and Meta process message data under their own terms with the customer (Cloud API hosting). Our DPA covers only our processing; customers must accept Meta's terms separately (I3).

## 4. Proposed design

### 4.1 Roles and documents (the "legal pack")
| Document | Purpose | Owner |
|---|---|---|
| Terms of Service | Commercial terms, acceptable use incl. WhatsApp policy obligations (opt-in, F5), suspension rules (I2 D5) | You + counsel |
| Data Processing Agreement | GDPR Art. 28 / PDPA / PDPL processor terms; signed by click-through at signup, countersigned PDF for Dedicated | You + counsel |
| Sub-processor list | AWS (region), Stripe (billing data only), SES/email, error tracking (I9), search vendor (I10), Meta (customer's own contract) | Public page, 30-day change notice |
| Privacy notice | Our processing of customer staff and website visitors (we are controller for that) | Public page |
| Security overview | Encryption, access control, MFA, audit log, backups, incident response, hosting regions (answers questionnaires) | Public page / PDF |
| Records of processing (ROPA) | Our Art. 30(2) record as processor | Internal |
| Breach response procedure | Detect → assess → notify customers without undue delay (target ≤ 24 h) so they can meet 72 h / 3 days | Internal, linked from the runbook (I9) |

### 4.2 Retention
- **Workspace setting:** retain messages and notes for N months after the **last activity in the chat** (choices: 6, 12, 24, 36 months, or "until deleted"; default 24, D1). Media files (F2) can have a shorter retention (default 12 months).
- **Mechanism:** a daily sweep per workspace queries chats by `lastMessageAt` (I2's `byWorkspace` GSI) older than the cut-off and runs the **chat erasure** job (§4.3) on them. TTL is used only for ephemeral items (login attempts, reset tokens, sessions, idempotency records), never as the primary retention control for chats, because of its timing and the linked list.
- Workspace closure: data kept 30 days after cancellation (reactivation window), then erased (D2), with export available meanwhile.
- Logs: 30 days (I9 D4); audit log 1 year (I6 D5).

### 4.3 Erasure
Three scopes, all asynchronous jobs with progress and an audit entry (I6):
1. **Client erasure** (a client asks the business to delete their data): admin opens the chat → "Delete client data" → confirm by typing the display name. Deletes all messages, notes (F4), tags and description, media objects (F2), search index entries (I10), consent records except a hashed opt-out suppression entry (F5 D5), and the chat item. Analytics rollups (I11) hold no personal data and stay.
2. **Chat retention erasure:** the same job, triggered by §4.2.
3. **Workspace erasure:** everything with the `workspaceId`, plus secrets (Meta tokens) and the Stripe customer's metadata (invoices are kept as legally required accounting records, D3).
- **Implementation:** walk the chat's messages (Query by `chatId`, needs a `byChat` GSI or the I2 key design) and BatchWrite deletes; the chat item last, conditioned on `headMessageId` unchanged so a message arriving mid-erasure is caught (retry the job; if the client wrote again, the business must decide whether to erase again).
- **Backups:** erased data remains in PITR until the window passes (I9 D2). The DPA and privacy notice state the maximum (e.g. 35 days). A restore must re-apply an "erasure ledger" (hashed chat keys erased since the restore point) before going live.
- **Message-level delete** (one message, e.g. a passport photo sent by mistake): replace the message's content with a tombstone (`deleted: true`, text removed, media object deleted) keeping `prevMessageId` so the linked list stays intact.

### 4.4 Access and export
- **Client data export** (Art. 15/20): admin → chat → "Export client data" → JSON + human-readable HTML/PDF of messages (with timestamps, direction, sender type, not internal staff IDs), notes, tags, consent records; media files zipped. Delivered as a short-lived download link (S3 presigned URL, 24 h) and recorded in the audit log.
- **Workspace export** (portability and exit): full export of chats, messages, notes, users (no password hashes), templates, settings, as JSON lines in a zip; owner only; also offered at cancellation.

### 4.5 Encryption and access to data
- Customer-managed KMS key per stage for all tables, the S3 media bucket (F2) and secrets (I6). Dedicated stacks can use a key in the customer's account (bring-your-own-key, D5).
- Field-level encryption for the highest-risk fields is optional: F4 notes and media are the likely candidates (D6).
- Operator access to customer data only through time-boxed, audited grants (I2 D4). Production AWS console access limited to break-glass roles with MFA, logged in CloudTrail.

### 4.6 Data residency
- Pooled stacks per region (I2): start with one region (D4), add a second when a customer requires it. Each workspace records its `region`; data never moves between regions.
- Dedicated stacks (I2 D1) in the customer's preferred region or own AWS account.
- Sub-processors that receive personal data (error tracking, search, email) are chosen per region or configured not to receive personal data (I9 §4.4 scrubbing).

### 4.7 Customer-facing compliance features
- A "Privacy" settings page: retention, export, erasure, data region, DPA download, sub-processor list link, audit log (I6).
- A notice in the agent UI's note box (F4) and composer: don't paste card or passport numbers into notes; an optional detector warns on card-like and passport-like patterns (D7).

### 4.8 Certifications (later)
- A security questionnaire (CAIQ-lite) answered once and kept in the security overview.
- SOC 2 Type I/II or ISO 27001 only when deals require it; they're organisational programmes rather than features (D8).

## 5. Affected modules and files
- **Core:** new `privacy/` (erasure jobs, export builders, retention sweep, erasure ledger); `messages/` (tombstone delete; `byChat` access path); `chats/repo.js` (retention queries via I2 GSI).
- **M1:** `serverless.yml` (KMS key and table `SSESpecification`; `Jobs` table; erasure/export Lambdas; retention schedule; export S3 bucket with lifecycle rule, F2 bucket lifecycle).
- **M7:** routes `privacy/settings`, `chats/[id]/export`, `chats/[id]/erase`, `messages/[id]` (delete), `workspace/export`, `jobs/[id]`.
- **M8:** Settings → Privacy; chat menu actions; job progress UI.
- **Docs:** `PRD.md` §Deferred (resolved items), new `docs/legal/` drafts (ToS, DPA, sub-processors, privacy notice, security overview), `docs/runbook.md` (breach procedure, restore with erasure ledger).

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Default retention? | **24 months after last activity**, configurable; media 12 months |
| D2 | Grace period after workspace cancellation? | **30 days**, then erasure; export available during it |
| D3 | What survives workspace erasure? | **Invoices and billing records** (legal requirement) and **hashed opt-out suppression entries** only |
| D4 | First region for pooled customers? | **Choose by first customers:** `ap-south-1` today; `ap-southeast-1` (Singapore) for SEA; `me-central-1` (UAE) or a KSA region if Saudi customers require local storage (confirm availability and PDPL needs) |
| D5 | Customer-managed keys for Dedicated? | **Yes, offer BYOK on Dedicated** |
| D6 | Field-level encryption for notes/media? | **Not in Phase 1**; table-level KMS is sufficient; revisit for regulated customers |
| D7 | Sensitive-number detector? | **Warn-only**, client-side, in notes and composer |
| D8 | When to pursue SOC 2/ISO 27001? | **When a deal requires it**; build controls (I6, I9) now so evidence exists |

## 7. Risks
- **Legal exposure as a processor** without a DPA: customers in the EU/UK can't lawfully use us. The DPA is a launch blocker for those markets.
- **Incomplete erasure:** data copied to search indexes, media buckets, exports, logs or error trackers can be missed. Mitigation: a single erasure job that owns the list of stores, plus tests that seed every store and verify deletion.
- **Backups vs erasure:** PITR retains erased data for its window; must be disclosed and handled on restore (erasure ledger).
- **Linked-list integrity** during deletes: deleting whole chats is safe; single-message delete uses tombstones.
- **Cross-border transfers** (KSA PDPL, others): hosting in the wrong region can block deals; residency per workspace mitigates.
- **Customer misuse** (no opt-in, storing sensitive categories): handled by ToS, F5 consent features and in-app guidance; we can't fully prevent it.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Launch blockers | Legal pack drafts (ToS, DPA, sub-processors, privacy notice) reviewed by counsel; client erasure and export jobs; workspace export; KMS encryption on tables; breach procedure in the runbook | M |
| 2. Retention | Workspace retention settings and daily sweep; message tombstone delete; workspace closure erasure after grace period; erasure ledger for restores | M |
| 3. Residency and enterprise | Second region; Dedicated BYOK; security overview and questionnaire answers; sensitive-number warnings | M |

## 9. Acceptance criteria
- [ ] "Delete client data" on a chat removes its messages, notes, tags, media, search entries and chat item from every store (verified by a scripted check per store), leaves a hashed opt-out entry if one existed, and writes an audit entry.
- [ ] "Export client data" produces a zip with all messages, notes, tags and consent records for that client, with no other client's data and no staff password hashes.
- [ ] With retention set to 6 months, a chat whose last activity was 7 months ago is erased within 48 h; a chat active 5 months ago is untouched.
- [ ] All `prod` tables and buckets use the stage's customer-managed KMS key.
- [ ] A signup can't complete without accepting the ToS and DPA; the accepted versions and timestamp are stored.
- [ ] The breach procedure in the runbook commits to notifying affected customers within 24 h of confirmation, and names who does it.
