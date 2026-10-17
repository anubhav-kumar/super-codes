# @vartalap/whatsapp

AWS side of Vartalap, defined in `serverless.yml` (Serverless Framework v4):

- DynamoDB tables `vartalap-<stage>-messages`, `-chats` and `-users` (on-demand), with GSIs `byWaMessageId`, `byAssignee` and `byEmail`.
- SQS FIFO queue `vartalap-<stage>-outbound.fifo` and DLQ `vartalap-<stage>-outbound-dlq.fifo` (`maxReceiveCount: 3`).
- Lambdas `webhook` (HTTP API `GET`/`POST /webhook`) and `sender` (SQS, `batchSize: 1`). Each has its own least-privilege IAM role.

Handler code lives in `src/handlers/` (M5, M6). Bundling uses v4's built-in esbuild (ESM, `@vartalap/core` bundled in).

## Prerequisites

1. **Serverless login.** v4 needs an account: run `npx serverless login` once, or set `SERVERLESS_ACCESS_KEY` in CI. A paid license is required if the deploying business's annual revenue is above USD 2M.
2. **AWS credentials** for the target account (for example via `assume`).
3. **SSM parameters** for the stage. Create them as `SecureString` before the first deploy; the deploy fails if any are missing:

   | Parameter                              | Value                                                     |
   | -------------------------------------- | --------------------------------------------------------- |
   | `/vartalap/<stage>/WA_PHONE_NUMBER_ID` | WhatsApp Cloud API phone number ID                        |
   | `/vartalap/<stage>/WA_ACCESS_TOKEN`    | Cloud API access token                                    |
   | `/vartalap/<stage>/WA_APP_SECRET`      | Meta app secret (webhook signature check)                 |
   | `/vartalap/<stage>/WA_VERIFY_TOKEN`    | Any random string; also entered in the Meta webhook setup |

   ```sh
   aws ssm put-parameter --type SecureString --name /vartalap/dev/WA_ACCESS_TOKEN --value '<value>'
   ```

   Never commit the values. The Framework resolves them at deploy time and stores them as Lambda environment variables (encrypted at rest), so redeploy after rotating one.

## Deploy and remove

```sh
cd services/whatsapp
npx serverless deploy --stage dev              # or: npm run deploy -- --stage dev
npx serverless deploy --stage dev --region ap-southeast-1
npx serverless package --stage dev             # build only, no deploy
npx serverless remove --stage dev              # deletes the stack, including the tables and their data
```

Stage defaults to `dev` and region to `ap-southeast-1`. The Graph API version (`WA_GRAPH_VERSION`) and sender timeout are set under `params` in `serverless.yml`.

Deploy outputs (`npx serverless info --stage dev --verbose`): `MessagesTableName`, `ChatsTableName`, `UsersTableName`, `OutboundQueueUrl`, `OutboundDlqUrl`, `WebhookUrl` (register in the Meta app) and the Framework's `HttpApiUrl`. Copy the table names and queue URL into `apps/web/.env.local`.

## IAM for the local Next.js app

The web app runs on localhost with `assume` credentials. That role needs read/write on the three tables and their indexes, plus `sqs:SendMessage` on the outbound queue. Sample policy for `dev` (replace `<account-id>`):

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
        "arn:aws:dynamodb:ap-southeast-1:<account-id>:table/vartalap-dev-messages",
        "arn:aws:dynamodb:ap-southeast-1:<account-id>:table/vartalap-dev-messages/index/*",
        "arn:aws:dynamodb:ap-southeast-1:<account-id>:table/vartalap-dev-chats",
        "arn:aws:dynamodb:ap-southeast-1:<account-id>:table/vartalap-dev-chats/index/*",
        "arn:aws:dynamodb:ap-southeast-1:<account-id>:table/vartalap-dev-users",
        "arn:aws:dynamodb:ap-southeast-1:<account-id>:table/vartalap-dev-users/index/*"
      ]
    },
    {
      "Sid": "VartalapOutboundQueue",
      "Effect": "Allow",
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:ap-southeast-1:<account-id>:vartalap-dev-outbound.fifo"
    }
  ]
}
```

`TransactWriteItems` (used by the linked-list append) is authorized through the `PutItem`, `UpdateItem` and `ConditionCheckItem` actions above. `Scan` is needed for the admin "all chats" view.
