# M1: AWS Infrastructure

**Phase:** 2 · **Depends on:** M0 · **Unblocks:** M5, M6, real-resource testing of M7

## Goal
Define every AWS resource in `services/whatsapp/serverless.yml`, so that one `serverless deploy --stage <stage>` creates the whole AWS side.

## Tooling
[Serverless Framework v4](https://www.serverless.com/framework/docs) (decided 2026-10-17).
- Authenticate with `serverless login`, or set `SERVERLESS_ACCESS_KEY` in CI. The deploying business needs a Serverless account, and a paid license if its annual revenue is above USD 2M.
- Pin the framework version with `frameworkVersion: "4"` in `serverless.yml`.
- Use v4's built-in esbuild bundling (`build.esbuild`); do not add `serverless-esbuild` or other bundling plugins.
- **The AWS SDK is bundled, not taken from the runtime:** it is imported through the workspace package `@vartalap/core`, so v4's automatic `@aws-sdk/*` external doesn't apply. The SDK is CommonJS and calls `require('node:https')`, which crashes in an ESM bundle ("Dynamic require ... is not supported"). `services/whatsapp/esbuild.config.cjs` (via `build.esbuild.configFile`) adds a `createRequire` banner to fix this. Keep it while the output format is ESM.

## Scope
- **Provider:** `nodejs22.x`, region `ap-south-1` by default (override with `--region`), stage parameter. The built-in esbuild bundling (`build.esbuild`, ESM output) includes `@vartalap/core` in each function.
- **DynamoDB tables** (on-demand, point-in-time recovery off for the trial):
  - `vartalap-<stage>-messages`: PK `messageId`; GSI `byWaMessageId` (PK `waMessageId`, projection ALL).
  - `vartalap-<stage>-chats`: PK `chatId`; GSI `byAssignee` (PK `assignedTo`, SK `lastMessageAt`, projection ALL).
  - `vartalap-<stage>-users`: PK `userId`; GSI `byEmail` (PK `email`). Email uniqueness uses a guard item `userId = EMAIL#<email>` (see M3).
- **SQS:**
  - `vartalap-<stage>-outbound.fifo`: content-based deduplication off (the sender passes `MessageDeduplicationId`). Visibility timeout of at least 6× the sender Lambda's timeout.
  - `vartalap-<stage>-outbound-dlq.fifo`; redrive `maxReceiveCount: 3`.
  - As built: sender timeout 30 s, queue visibility timeout 180 s (both under `params` in `serverless.yml`).
- **Functions** (code written in M5 and M6; M1 wires them up):
  - `webhook`: HTTP API `GET /webhook` and `POST /webhook`.
  - `sender`: SQS event source on the outbound queue, `batchSize: 1`.
- **IAM:** least privilege, one role per function (v4 built-in `provider.iam.role.mode: perFunction`, no plugin):
  - webhook: read/write on messages + chats, query `byWaMessageId`.
  - sender: read/update on messages; SQS consume.
- **WhatsApp settings (decided 2026-10-17):** the stack itself creates `/vartalap/<stage>/WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET` and `WA_VERIFY_TOKEN` as `AWS::SSM::Parameter` resources.
  - They are type `String`, because CloudFormation can't create `SecureString`; they are protected by IAM only.
  - They start as the placeholder `CHANGE_ME`. Real values are set once after the first deploy with `aws ssm put-parameter --overwrite`.
  - Functions get only the parameter **names** they need (`WA_*_PARAM` env vars), plus `ssm:GetParameters` on just those parameters. They read the values at runtime through `services/whatsapp/src/lib/params.js` (cached 5 min), so nothing is resolved at deploy time.
  - webhook reads `WA_PHONE_NUMBER_ID`, `WA_APP_SECRET` and `WA_VERIFY_TOKEN`; sender reads `WA_PHONE_NUMBER_ID` and `WA_ACCESS_TOKEN`.
- **Other env:** `STAGE`, `MESSAGES_TABLE`, `CHATS_TABLE`, `USERS_TABLE`, `OUTBOUND_QUEUE_URL` and `WA_GRAPH_VERSION` (plain value, `v26.0`). `AWS_REGION` is not set in `serverless.yml`: it is a reserved variable that the Lambda runtime provides.
- **Outputs:** table names, queue URL, DLQ URL, webhook URL.
- **Config parameters (2026-10-17):** the stack also writes `/vartalap/<stage>/config/{MESSAGES_TABLE,CHATS_TABLE,USERS_TABLE,OUTBOUND_QUEUE_URL}` (String, real values via `!Ref`). The local web app and scripts load them at startup, so `apps/web/.env.local` needs only `AWS_REGION` and `STAGE` (the scripts read those two from the shell instead).
- A separate IAM note in the README on what the local Next.js app needs: read/write on all three tables + indexes, and `sqs:SendMessage`. It runs with `assume` credentials.

## Exposes
- Resource names that follow `vartalap-<stage>-*`, as used by `packages/core/config.js`.
- The webhook URL, to register in the Meta app (M9).

## Done when
- [ ] `serverless deploy --stage dev` succeeds from a clean account, and `serverless remove` cleans up.
- [ ] All three tables, the indexes, the FIFO queue and the DLQ exist with the settings above.
- [ ] The four SSM parameters are created by the stack with the placeholder value; no secret values are in the repo.
- [ ] The local app can reach the tables and queue using `assume` credentials.

## F4 changes (client attributes, 2026-10-17)
- New `ClientNotesTable` (`vartalap-<stage>-client-notes`; PK `chatId`, SK `noteId`; on-demand; `DeletionProtectionEnabled`; no GSI; PITR off for the trial) and SSM `/vartalap/<stage>/config/CLIENT_NOTES_TABLE`, in a commented F4 block in `serverless.yml`. Output `ClientNotesTableName`.
- No Lambda IAM or environment changes: the Lambdas never touch notes or the new Chats attributes. `CLIENT_NOTES_TABLE` is an optional config key for the web app only.

## F2 changes (media messages, 2026-10-17)
In commented F2 blocks in `serverless.yml` (defined, not yet deployed):
- `MediaBucket` (`vartalap-<stage>-media-<accountId>`): Block Public Access, BucketOwnerEnforced, SSE-S3, lifecycle (abort multipart after 1 day, expire everything after 90 days), CORS `POST` from `${param:mediaWebOrigin}`, `DeletionPolicy: Retain`. `MediaBucketPolicy` denies non-TLS access and any `GetObject` of objects tagged `THREATS_FOUND`.
- `MediaFetchQueue` (standard, visibility 720 s, maxReceiveCount 5) + `MediaFetchDlq`; `mediaFetch` Lambda (1024 MB, 120 s).
- `MediaMalwareProtectionRole` + `MediaMalwareProtectionPlan` (GuardDuty Malware Protection for S3, tagging on, prefixes `in/` and `out/`). The role policy is unverified against current AWS docs.
- SSM `/vartalap/<stage>/config/MEDIA_BUCKET` and `MEDIA_SCAN_REQUIRED` (optional config keys for the web app).
- Webhook: `sqs:SendMessage` on `MediaFetchQueue`, env `MEDIA_FETCH_QUEUE_URL`. Sender: `s3:GetObject`/`s3:GetObjectTagging` on `out/*`, env `MEDIA_BUCKET`, `MEDIA_SCAN_REQUIRED`, 512 MB, timeout 90 s (queue visibility 540 s).
- No new DynamoDB table or GSI.
