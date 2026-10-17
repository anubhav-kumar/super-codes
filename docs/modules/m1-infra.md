# M1: AWS Infrastructure

**Phase:** 2 · **Depends on:** M0 · **Unblocks:** M5, M6, real-resource testing of M7

## Goal
Define every AWS resource in `services/whatsapp/serverless.yml`, so that one `serverless deploy --stage <stage>` creates the whole AWS side.

## Tooling
[Serverless Framework v4](https://www.serverless.com/framework/docs) (decided 2026-10-17).
- Authenticate with `serverless login`, or set `SERVERLESS_ACCESS_KEY` in CI. The deploying business needs a Serverless account, and a paid license if its annual revenue is above USD 2M.
- Pin the framework version with `frameworkVersion: "4"` in `serverless.yml`.
- Use v4's built-in esbuild bundling (`build.esbuild`); do not add `serverless-esbuild` or other bundling plugins.

## Scope
- **Provider:** `nodejs22.x`, region from config (`ap-southeast-1` assumed), stage parameter. The built-in esbuild bundling (`build.esbuild`, ESM output) includes `@vartalap/core` in each function.
- **DynamoDB tables** (on-demand, point-in-time recovery off for the trial):
  - `vartalap-<stage>-messages`: PK `messageId`; GSI `byWaMessageId` (PK `waMessageId`, projection ALL).
  - `vartalap-<stage>-chats`: PK `chatId`; GSI `byAssignee` (PK `assignedTo`, SK `lastMessageAt`, projection ALL).
  - `vartalap-<stage>-users`: PK `userId`; GSI `byEmail` (PK `email`). Email uniqueness uses a guard item `userId = EMAIL#<email>` (see M3).
- **SQS:**
  - `vartalap-<stage>-outbound.fifo`: content-based deduplication off (the sender passes `MessageDeduplicationId`). Visibility timeout of at least 6× the sender Lambda's timeout.
  - `vartalap-<stage>-outbound-dlq.fifo`; redrive `maxReceiveCount: 3`.
- **Functions** (code written in M5 and M6; M1 wires them up):
  - `webhook`: HTTP API `GET /webhook` and `POST /webhook`.
  - `sender`: SQS event source on the outbound queue, `batchSize: 1`.
- **IAM:** least privilege, granted per function where possible:
  - webhook: read/write on messages + chats, query `byWaMessageId`.
  - sender: read/update on messages; SQS consume.
- **Secrets:** `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET` and `WA_VERIFY_TOKEN`, read from SSM `/vartalap/<stage>/...`.
- **Outputs:** table names, queue URL, webhook URL, so they can be copied into `apps/web/.env.local`.
- A separate IAM note in the README on what the local Next.js app needs: read/write on all three tables + indexes, and `sqs:SendMessage`. It runs with `assume` credentials.

## Exposes
- Resource names that follow `vartalap-<stage>-*`, as used by `packages/core/config.js`.
- The webhook URL, to register in the Meta app (M9).

## Done when
- [ ] `serverless deploy --stage dev` succeeds from a clean account, and `serverless remove` cleans up.
- [ ] All three tables, the indexes, the FIFO queue and the DLQ exist with the settings above.
- [ ] The SSM parameters are documented; no secret values are in the repo.
- [ ] The local app can reach the tables and queue using `assume` credentials.
