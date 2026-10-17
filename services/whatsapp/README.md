# @vartalap/whatsapp

AWS side of Vartalap, defined in `serverless.yml` (Serverless Framework v4):

- DynamoDB tables `vartalap-<stage>-messages`, `-chats` and `-users` (on-demand), with GSIs `byWaMessageId`, `byAssignee` and `byEmail`.
- SQS FIFO queue `vartalap-<stage>-outbound.fifo` and DLQ `vartalap-<stage>-outbound-dlq.fifo` (`maxReceiveCount: 3`).
- Lambdas `webhook` (HTTP API `GET`/`POST /webhook`) and `sender` (SQS, `batchSize: 1`). Each has its own least-privilege IAM role.

Handler code lives in `src/handlers/` (M5, M6). Bundling uses v4's built-in esbuild (ESM, with `@vartalap/core` and the AWS SDK bundled in). `esbuild.config.cjs` adds a `createRequire` banner so the bundled CommonJS SDK can load Node built-ins. Without it the Lambdas crash at start with "Dynamic require ... is not supported".

## Prerequisites

1. **Serverless login.** v4 needs an account: run `npx serverless login` once, or set `SERVERLESS_ACCESS_KEY` in CI. A paid license is required if the deploying business's annual revenue is above USD 2M.
2. **AWS credentials** for the target account (for example via `assume`).
3. Nothing else. The stack creates its own SSM parameters (see below). Do **not** create `/vartalap/<stage>/WA_*` parameters by hand before the first deploy, or CloudFormation fails with "already exists".

## WhatsApp settings (SSM)

The stack creates these SSM parameters as type `String`, with the placeholder value `CHANGE_ME`:

| Parameter                              | Value                                                     | Read by         |
| -------------------------------------- | --------------------------------------------------------- | --------------- |
| `/vartalap/<stage>/WA_PHONE_NUMBER_ID` | WhatsApp Cloud API phone number ID                        | webhook, sender |
| `/vartalap/<stage>/WA_ACCESS_TOKEN`    | Cloud API access token                                    | sender          |
| `/vartalap/<stage>/WA_APP_SECRET`      | Meta app secret (webhook signature check)                 | webhook         |
| `/vartalap/<stage>/WA_VERIFY_TOKEN`    | Any random string; also entered in the Meta webhook setup | webhook         |

After the first deploy, set the real values once:

```sh
aws ssm put-parameter --overwrite --type String --name /vartalap/dev/WA_ACCESS_TOKEN --value '<value>'
```

- **Why `String`:** CloudFormation cannot create `SecureString` parameters. These values are protected by IAM only, not KMS. Each Lambda's role can read only the parameters it uses.
- **Runtime reads:** the Lambdas get the parameter _names_ as environment variables (`WA_*_PARAM`) and read the values at runtime through `src/lib/params.js`, cached for 5 minutes. A rotated value takes effect within 5 minutes, with no redeploy. A value still at `CHANGE_ME` makes the function fail with a clear error.
- **Later deploys** leave your values alone, as long as the parameter definitions in `serverless.yml` don't change. Editing a parameter's `Value` or `Description` there resets it to the placeholder, so re-set it after such a change.
- **`serverless remove`** deletes the parameters along with the rest of the stack.
- Never commit the values.

## Deploy and remove

```sh
cd services/whatsapp
npx serverless deploy --stage dev              # or: npm run deploy -- --stage dev
npx serverless deploy --stage dev --region <region>
npx serverless package --stage dev             # build only, no deploy
npx serverless remove --stage dev              # deletes the stack, including the tables and their data
```

Stage defaults to `dev` and region to `ap-south-1`. The Graph API version (`WA_GRAPH_VERSION`) and sender timeout are set under `params` in `serverless.yml`.

Deploy outputs (`npx serverless info --stage dev --verbose`): `MessagesTableName`, `ChatsTableName`, `UsersTableName`, `OutboundQueueUrl`, `OutboundDlqUrl`, `WaParameterNames`, `WebhookUrl` (register in the Meta app) and the Framework's `HttpApiUrl`. Copy the table names and queue URL into `apps/web/.env.local`.

## IAM for the local Next.js app

The web app runs on localhost with `assume` credentials. That role needs read/write on the three tables and their indexes, plus `sqs:SendMessage` on the outbound queue. Sample policy for `dev` in `ap-south-1` (replace `<account-id>`, and the region if you deploy elsewhere):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VartalapTables",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:ConditionCheckItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-south-1:<account-id>:table/vartalap-dev-messages",
        "arn:aws:dynamodb:ap-south-1:<account-id>:table/vartalap-dev-messages/index/*",
        "arn:aws:dynamodb:ap-south-1:<account-id>:table/vartalap-dev-chats",
        "arn:aws:dynamodb:ap-south-1:<account-id>:table/vartalap-dev-chats/index/*",
        "arn:aws:dynamodb:ap-south-1:<account-id>:table/vartalap-dev-users",
        "arn:aws:dynamodb:ap-south-1:<account-id>:table/vartalap-dev-users/index/*"
      ]
    },
    {
      "Sid": "VartalapOutboundQueue",
      "Effect": "Allow",
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:ap-south-1:<account-id>:vartalap-dev-outbound.fifo"
    }
  ]
}
```

`TransactWriteItems` (used by the linked-list append) is authorized through the `PutItem`, `UpdateItem` and `ConditionCheckItem` actions above. `Scan` is needed for the admin "all chats" view.
