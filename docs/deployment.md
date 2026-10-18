# Vartalap: Deployment Guide

This guide deploys Vartalap to one AWS stage (examples use `dev`), runs the web app, smoke-tests it without Meta, and then connects the live WhatsApp Business number.

Commands are bash/zsh. For fish, use `set VAR value` instead of `VAR=value` and `(cmd)` instead of `$(cmd)`.

## What gets deployed
| Part | Where | How |
|---|---|---|
| DynamoDB tables `vartalap-<stage>-messages`, `-chats`, `-users` | AWS | `serverless deploy` (CloudFormation) |
| SQS FIFO queue `vartalap-<stage>-outbound.fifo`, plus its DLQ | AWS | same |
| Lambdas `webhook` (HTTP API `GET`/`POST /webhook`) and `sender` (SQS) | AWS | same |
| SSM secrets `/vartalap/<stage>/WA_*` and `/vartalap/<stage>/JWT_SECRET` (placeholder `CHANGE_ME`; you set them in step 3) | AWS | same |
| SSM config `/vartalap/<stage>/config/*`: table names and queue URL (real values, written by every deploy) | AWS | same |
| Web app (Next.js UI + API) | Your machine (`localhost:3000`) for now | `npm run dev` |

Hosting the web app itself is out of scope for v1. It runs locally against the AWS stage. Its `.env.local` holds only `AWS_REGION` and `STAGE`; everything else comes from SSM.

**Already deployed before the SSM changes?** See [Upgrading an existing deployment](#upgrading-an-existing-deployment).

---

## 1. Prerequisites (one-time)

### 1.1 Tools
- **Node.js 22 or later.** The repo pins 22 in `.nvmrc`; Lambdas run `nodejs22.x`.
- **AWS CLI v2.**
- **OpenSSL**, used to generate secrets and to sign test webhooks.
- **A Serverless Framework account.** v4 needs a login. A paid license is required if the deploying organization's annual revenue is above USD 2M.

### 1.2 AWS access
Sign in to the target account, for example with `assume`, and check it:
```bash
aws sts get-caller-identity
```
The deploying role needs permission to create and update CloudFormation stacks, DynamoDB, SQS, Lambda, IAM roles, API Gateway (HTTP API), CloudWatch Logs and SSM parameters.

The role that runs the **web app** needs less. A sample policy is in [`services/whatsapp/README.md`](../services/whatsapp/README.md#iam-for-the-local-nextjs-app). It covers:
- read/write on the three tables and their indexes;
- `sqs:SendMessage` on the outbound queue;
- `ssm:GetParametersByPath` on `/vartalap/<stage>/config`;
- `ssm:GetParameter` on `/vartalap/<stage>/JWT_SECRET`.

### 1.3 Install and log in
```bash
cd <repo>/whatsapp
npm install
cd services/whatsapp
npx serverless login        # opens a browser; or set SERVERLESS_ACCESS_KEY in CI
```

> Do **not** create any `/vartalap/<stage>/...` SSM parameter by hand before the first deploy (`WA_*`, `JWT_SECRET`, `config/*`). The stack creates them, and the deploy fails with "already exists" if one is already there.

---

## 2. Deploy the AWS stack
```bash
cd <repo>/whatsapp/services/whatsapp
npx serverless deploy --stage dev                       # region defaults to ap-south-1
# other region:  npx serverless deploy --stage dev --region <region>
```
When it finishes, show the outputs:
```bash
npx serverless info --stage dev --verbose
```
Note these values; later steps use them:

| Output | Used for |
|---|---|
| `MessagesTableName`, `ChatsTableName`, `UsersTableName`, `OutboundQueueUrl` | For reference only: the stack also publishes them to SSM `/vartalap/<stage>/config/*`, and the web app loads them from there |
| `OutboundDlqUrl` | Inspecting failed sends |
| `WaParameterNames`, `JwtSecretParameterName` | The SSM secrets to fill in (step 3) |
| `WebhookUrl` | Registering the webhook in the Meta app (step 6) |

---

## 3. Set the secrets in SSM
All secrets live in SSM, never in env files. The stack creates five `String` parameters with the value `CHANGE_ME`. Until you set them, the Lambdas and the web app fail with a clear error.

| Parameter | Value | Read by |
|---|---|---|
| `/vartalap/<stage>/WA_PHONE_NUMBER_ID` | WhatsApp Cloud API phone number ID | webhook, sender |
| `/vartalap/<stage>/WA_ACCESS_TOKEN` | Cloud API access token (use a System User token; the dashboard token expires in about 24 h) | sender |
| `/vartalap/<stage>/WA_APP_SECRET` | Meta app secret (App settings → Basic) | webhook |
| `/vartalap/<stage>/WA_VERIFY_TOKEN` | Any random string; you enter the same one in Meta | webhook |
| `/vartalap/<stage>/JWT_SECRET` | Session signing key, a random string of at least 32 characters | web app |

```bash
STAGE=dev
put() { aws ssm put-parameter --overwrite --type String --name "/vartalap/$STAGE/$1" --value "$2"; }

put WA_PHONE_NUMBER_ID '<phone-number-id>'
put WA_ACCESS_TOKEN    '<access-token>'
put WA_APP_SECRET      '<app-secret>'
put WA_VERIFY_TOKEN    "$(openssl rand -hex 16)"
put JWT_SECRET         "$(openssl rand -hex 32)"
```

**Test values first?** To smoke-test before touching the live number (step 5), use test values instead and save them in your shell:
```bash
APP_SECRET=$(openssl rand -hex 32); VERIFY_TOKEN=$(openssl rand -hex 16)
put WA_PHONE_NUMBER_ID 100000000000001
put WA_ACCESS_TOKEN    dummy
put WA_APP_SECRET      "$APP_SECRET"
put WA_VERIFY_TOKEN    "$VERIFY_TOKEN"
put JWT_SECRET         "$(openssl rand -hex 32)"
```

**Notes:**
- **No redeploy needed:** the Lambdas and the web app read these values at runtime and cache them for 5 minutes. A change takes effect within 5 minutes. Changing `JWT_SECRET` signs everyone out.
- **Not encrypted:** the values are SSM `String` type, protected by IAM only (CloudFormation can't create `SecureString`). Each Lambda can read only the parameters it uses. The web app's role needs `ssm:GetParameter` on `JWT_SECRET` and `ssm:GetParametersByPath` on `config`, nothing else.
- **Can be reset:** later deploys leave your secret values alone, unless you edit a parameter's `Value` or `Description` in `serverless.yml`. That resets it to `CHANGE_ME`.
- **Don't edit `config/*`:** the stack overwrites those on every deploy.

---

## 4. Run the web app
Create `apps/web/.env.local` from `.env.example`. It needs just two lines:
```dotenv
AWS_REGION=ap-south-1           # must be the stack's region
STAGE=dev                       # selects /vartalap/<stage>/... in SSM
```
Everything else comes from SSM:
- The table names and queue URL come from `/vartalap/<stage>/config/*`. The stack publishes them on every deploy, and the web app and seed script load them at startup.
- The session key comes from `/vartalap/<stage>/JWT_SECRET` (step 3).

AWS credentials come from your shell. A variable set in `.env.local` still overrides the SSM value, if you ever need that locally.

With AWS credentials active in the same shell:
```bash
cd <repo>/whatsapp
npm run seed -- admin@yourcompany.com "Admin Name"   # prints a one-time password; re-running prints "already exists"
npm run dev       # http://localhost:3000
```
`npm run seed` generates the first admin's password and **prints it once**; it is never stored in a file. Open `http://localhost:3000`, sign in with it, and **change it immediately** under **Password**. Then add agents under **Users**.

---

## 5. Smoke test (no Meta needed)
This needs the test values from step 3.

**5.1 Webhook verification.** It should print `12345`:
```bash
URL=<WebhookUrl>
curl "$URL?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=12345"
```

**5.2 Simulated inbound message.** This sends a signed payload, the same as Meta would. It should return `200`:
```bash
BODY='{"object":"whatsapp_business_account","entry":[{"id":"x","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"6500000000","phone_number_id":"100000000000001"},"contacts":[{"profile":{"name":"Test Client"},"wa_id":"6590000001"}],"messages":[{"from":"6590000001","id":"wamid.TEST1","timestamp":"1792200000","type":"text","text":{"body":"Hello from test"}}]}}]}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$APP_SECRET" | awk '{print $NF}')
curl -i -X POST "$URL" -H 'content-type: application/json' -H "x-hub-signature-256: sha256=$SIG" --data-raw "$BODY"
```

**5.3 Check it in the UI:**
1. **Chats → Unassigned** shows "Test Client" within about 5 s.
2. Click **Auto-assign**; the chat is assigned to the next agent.
3. Send a reply. It shows as "Sending…" and then turns **Failed**, because the access token is the dummy one. That proves the whole path ran: UI → API → SQS → sender Lambda → Meta → status update.

**Optional checks:**
- Re-sending the same request in 5.2 creates no duplicate.
- Changing one character of `$SIG` gets a `401`.

Delete the test chat and messages in the DynamoDB console afterwards, or test on a separate stage.

---

## 6. Connect the live WhatsApp Business number

> **This is a cut-over.** A Meta app has one webhook URL. Once it points here, customer messages arrive **only** in Vartalap, so any current integration stops receiving them. Before doing it, make sure agents and admins have accounts and the web app is running. If you can, try it first with a test number in the same Meta Business account.
>
> The number must be on the **WhatsApp Cloud API**. A number used only in the WhatsApp Business *app* on a phone has to be connected to the Cloud API first.

1. Set the real SSM values (step 3).
2. In the Meta developer app, go to **WhatsApp → Configuration → Webhook**:
   - **Callback URL:** `WebhookUrl`
   - **Verify token:** the `WA_VERIFY_TOKEN` value
   - Click **Verify and save**, then subscribe to the **messages** field.
3. Send a WhatsApp message to the business number from a phone. It appears under **Chats → Unassigned**.
4. Assign it and reply. The reply reaches the phone, and its status goes ✓ → ✓✓ → blue ✓✓ (read).

Agents can reply only within 24 hours of the client's last message. After that the composer is disabled until the client writes again.

---

## 7. Operating

| Task | Command / where |
|---|---|
| Redeploy after code changes | `cd services/whatsapp && npx serverless deploy --stage dev` |
| Webhook logs | `npx serverless logs -f webhook --stage dev --tail` |
| Sender logs | `npx serverless logs -f sender --stage dev --tail` |
| Rotate the WhatsApp token | `put WA_ACCESS_TOKEN '<new>'` (step 3); takes effect within 5 min |
| Failed sends | Messages show **Failed (code)** in the UI. Payloads that ran out of retries are in the DLQ (`OutboundDlqUrl`) |
| Re-drive the DLQ | `aws sqs start-message-move-task --source-arn <DLQ ARN>`. Messages already marked `failed` are skipped by the sender, so this mostly helps after an outage, before they were marked |

Logs never contain message text or full phone numbers, only the last 4 digits.

---

## 8. Tear down
```bash
cd <repo>/whatsapp/services/whatsapp
npx serverless remove --stage dev
```
This deletes **everything in the stage**: tables and their data, queues, Lambdas and the SSM parameters. Disconnect the Meta webhook first if it points at this stage.

---

## Upgrading an existing deployment
For a stage deployed **before** the session key and config moved to SSM (`fc2c1a1`, `68429f4`). Until you do this, login fails with "JWT_SECRET not found".

1. **Redeploy:** `cd services/whatsapp && npx serverless deploy --stage dev`. This creates `/vartalap/dev/JWT_SECRET` (placeholder) and `/vartalap/dev/config/*` (real values).
2. **Set a new session key.** Don't reuse the old one from `.env.local`. Everyone will need to sign in again.
   ```bash
   aws ssm put-parameter --region ap-south-1 --overwrite --type String \
     --name /vartalap/dev/JWT_SECRET --value "$(openssl rand -hex 32)"
   ```
3. **Trim `apps/web/.env.local`** to `AWS_REGION` and `STAGE`. Delete `JWT_SECRET`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, and the table and queue lines. Leftover table and queue lines would override SSM.
4. **Permissions:** if your role isn't admin, add the two SSM permissions from step 1.2.
5. **Restart** `npm run dev`. If the old admin password was ever stored in `.env.local`, change it under **Password**.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Deploy fails: parameter "already exists" | A `/vartalap/<stage>/...` parameter (`WA_*`, `JWT_SECRET` or `config/*`) was created by hand. Delete it and redeploy, then set the secret again (step 3) |
| Deploy asks for a login or license | Run `npx serverless login`, or set `SERVERLESS_ACCESS_KEY` |
| Webhook returns 500, log says "still the placeholder" | Set the SSM values (step 3) |
| Meta "Verify and save" fails | The verify token doesn't match `WA_VERIFY_TOKEN`, or the URL isn't `WebhookUrl` |
| Webhook returns 401 for real Meta traffic | `WA_APP_SECRET` is wrong (it must be the app secret, not the access token) |
| Inbound messages ignored | `WA_PHONE_NUMBER_ID` doesn't match the number Meta is sending for |
| Replies fail with code `190` | The access token has expired or is invalid. Use a System User token |
| Replies fail with code `131047` | More than 24 h since the client's last message |
| Web app or seed fails with "Missing config … under SSM /vartalap/<stage>/config/" | The stack for that stage/region hasn't been deployed with the config parameters yet; run `serverless deploy` (step 2). Check `STAGE`/`AWS_REGION` in `.env.local` |
| The web app fails with "Missing required env vars" | `AWS_REGION` or `STAGE` is missing from `apps/web/.env.local` (step 4) |
| A script (`seed`, `backfill:public-ids`, `reset-data`) says "No AWS region in the shell" | Run `assume` first. Scripts take the region from the shell and `STAGE` from the shell (default `dev`), not from `.env.local` |
| Login fails; log says "SSM parameter /vartalap/<stage>/JWT_SECRET not found in <region>" (older versions: `ParameterNotFound` / `UnknownError`) | The stack hasn't been redeployed since `JWT_SECRET` was added, or `.env.local` points to another stage or region. Run `serverless deploy` (step 2), then set it (step 3) |
| Web app fails with "SSM parameter /vartalap/<stage>/JWT_SECRET must be a random string…" | It's still `CHANGE_ME` or too short. Set it (step 3); check `STAGE` and `AWS_REGION` in `.env.local` |
| Lost the seeded admin's one-time password | Delete that user's item and its `EMAIL#<email>` guard item from the users table, then re-run `npm run seed -- <email> [name]` (or have another admin create a new admin) |
| Web app API calls return 500 / AccessDenied, or startup fails reading SSM | AWS credentials expired (re-run `assume`), or the role lacks the web-app permissions (step 1.2) |
| Signed out right after changing the password elsewhere | Expected: a password change ends all other sessions |
| Lambda crashes at start: `Dynamic require of "node:https" is not supported` | The esbuild `configFile` banner is missing. Check `build.esbuild.configFile: ./esbuild.config.cjs` in `serverless.yml`, then redeploy |
| Signed test webhook returns 200 but no chat appears; log `item_skipped` `other_phone_number_id` | The payload's `metadata.phone_number_id` doesn't match `/vartalap/<stage>/WA_PHONE_NUMBER_ID`. Use the same value in both. Meta's dashboard **Test** button also uses a fake ID, so it's skipped too; that's expected |
| Webhook logs `message_stored` but the UI shows nothing | `apps/web/.env.local` `AWS_REGION` isn't the stack's region, or you're on the wrong tab (new chats are under **Unassigned**) |
