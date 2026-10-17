# Vartalap: Project Boilerplate and Architecture

Status: draft · 2026-10-17 · Source of requirements: [`docs/PRD.md`](../PRD.md)

## 1. Summary
- **Monorepo with npm workspaces**, JavaScript only (ES modules, no TypeScript).
- **Three workspaces:**
  - `apps/web`: Next.js app (UI + API routes).
  - `services/whatsapp`: Serverless Framework Lambdas (webhook + sender) and the AWS resources.
  - `packages/core`: shared DynamoDB access and business rules, used by both of the above.
- **Why a shared core:** the Next.js API and the webhook Lambda both append messages to a chat's linked list. The compare-and-set on the head must be implemented once, in one place.

## 2. Tech choices
| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js 22 (LTS), Lambda `nodejs22.x` | Pinned in `.nvmrc` and `engines` |
| Package manager | npm workspaces | No extra tooling |
| Web app | Next.js (App Router), JavaScript | API routes in `app/api/**/route.js` |
| Lambdas + infrastructure | [Serverless Framework v4](https://www.serverless.com/framework/docs), using its built-in esbuild bundling (`build.esbuild`); no bundling plugin | esbuild bundles `packages/core` into each Lambda. v4 needs `serverless login` or a license key (`SERVERLESS_ACCESS_KEY`) |
| AWS SDK | AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-sqs`) | |
| Validation | Zod | Schemas only; no `export type` |
| IDs | ULID (`ulid`) | Sortable, so they help debugging |
| Auth | Custom JWT using `jose`, stored in an `httpOnly` cookie | `jose` also runs in Next.js middleware (edge runtime) |
| Password hashing | `bcryptjs` | Pure JavaScript, no native build |
| Lint/format | ESLint + Prettier | |

## 3. Repository layout
```
whatsapp/
├── package.json              # workspaces: apps/*, services/*, packages/*
├── .nvmrc                    # 22
├── .env.example              # every env var, no real values
├── docs/
│   ├── PRD.md
│   └── arch/boilerplate.md
├── packages/
│   └── core/                 # @vartalap/core
│       ├── package.json
│       └── src/
│           ├── index.js
│           ├── config.js             # table/queue names from env
│           ├── db/client.js          # DynamoDBDocumentClient singleton
│           ├── schemas/              # Zod: message, chat, user, whatsapp payloads
│           ├── messages/
│           │   ├── append.js         # linked-list append (see section 5.2)
│           │   ├── read.js           # walk the chat from the head, paginated
│           │   └── status.js         # status updates from WhatsApp callbacks
│           ├── chats/
│           │   ├── repo.js           # get/list/upsert chats
│           │   ├── assign.js         # manual + round-robin assignment
│           │   └── window.js         # 24-hour window check
│           ├── users/repo.js         # create/get users, password hashing
│           └── access.js             # canView / canSend rules per role
├── apps/
│   └── web/                  # Next.js
│       ├── package.json
│       ├── next.config.mjs
│       ├── middleware.js     # JWT check; redirects to /login
│       ├── lib/
│       │   ├── session.js    # sign/verify JWT, cookie helpers
│       │   └── api.js        # route helpers: requireUser, requireAdmin, error mapping
│       └── app/
│           ├── login/page.js
│           ├── chats/page.js                 # chat list (polls)
│           ├── chats/[phone]/page.js         # conversation (polls)
│           ├── admin/users/page.js           # create admins/agents
│           ├── account/password/page.js
│           └── api/
│               ├── auth/login/route.js       # POST
│               ├── auth/logout/route.js      # POST
│               ├── me/route.js               # GET
│               ├── me/password/route.js      # PUT
│               ├── users/route.js            # GET, POST (admin)
│               ├── chats/route.js            # GET (filtered by role)
│               ├── chats/[phone]/messages/route.js   # GET (poll, ?before=), POST (send)
│               ├── chats/[phone]/assign/route.js     # PUT { userId } (admin)
│               └── chats/[phone]/auto-assign/route.js # POST (admin, round-robin)
├── services/
│   └── whatsapp/
│       ├── package.json
│       ├── serverless.yml    # functions + DynamoDB tables + SQS FIFO + DLQ
│       └── src/
│           ├── handlers/
│           │   ├── webhook.js    # GET verify, POST messages + status callbacks
│           │   └── sender.js     # SQS → WhatsApp Cloud API
│           └── whatsapp/
│               ├── client.js     # Cloud API send
│               ├── signature.js  # X-Hub-Signature-256 check
│               └── parse.js      # webhook payload → core schemas
└── scripts/
    └── seed-admin.js         # creates the first admin with a default password
```

## 4. DynamoDB tables
All three tables are on-demand billing and are created by `services/whatsapp/serverless.yml`. That way one `sls deploy` sets up the whole AWS side.

### 4.1 `Messages`
| Attribute | Notes |
|---|---|
| `messageId` (PK) | Inbound: the WhatsApp message ID (`wamid…`), which deduplicates for free. Outbound: a ULID. |
| `chatId` | The client's phone number (E.164) |
| `prevMessageId` | The linked-list pointer; `null` for the first message |
| `direction` | `in` \| `out` |
| `senderType` / `senderId` | `client` \| `agent` \| `admin`, plus the user ID. Used only for the internal "sent by admin" label. |
| `type`, `text` | `type = "text"` for v1; the field is ready for media |
| `waMessageId` | Outbound only, set once WhatsApp accepts the message |
| `status` | `pending` \| `sent` \| `delivered` \| `read` \| `failed` (outbound) |
| `statusRank` | 0–3, kept in step with `status` so updates can only move forward |
| `errorCode` | WhatsApp error code when `failed` |
| `createdAt` | ISO timestamp |

GSI `byWaMessageId` (PK `waMessageId`): finds the outbound message when a status callback arrives.

### 4.2 `Chats`
| Attribute | Notes |
|---|---|
| `chatId` (PK) | The client's phone number |
| `headMessageId` | The latest message; updated on every append |
| `assignedTo` | A user ID or `UNASSIGNED` |
| `lastClientMessageAt` | Drives the 24-hour window |
| `lastMessageAt`, `lastMessagePreview` | For the chat list |
| `clientName` | The WhatsApp profile name, if provided |

GSI `byAssignee` (PK `assignedTo`, SK `lastMessageAt`): an agent's chat list, and the unassigned list for admins. The admin "all chats" view uses a Scan, which is acceptable at trial volume.

### 4.3 `Users`
| Attribute | Notes |
|---|---|
| `userId` (PK) | ULID |
| `email` | Login ID. GSI `byEmail` handles lookup; uniqueness is enforced with a guard item `EMAIL#<email>`. |
| `name`, `role` | `admin` \| `agent` |
| `passwordHash` | bcrypt |
| `active` | Lets an account be disabled without deleting it |
| `lastAutoAssignedAt` | Round-robin: auto-assign picks the active agent with the oldest value, then updates it |

## 5. Key flows

### 5.1 Inbound (webhook Lambda)
1. `GET`: answer Meta's `hub.verify_token` challenge.
2. `POST`: verify `X-Hub-Signature-256` against the Meta app secret, then parse the payload. The payload can contain new messages and/or status updates.
3. **New message:** `appendMessage()` with `messageId = wamid`. A duplicate fails the condition and is ignored. The chat is created as `UNASSIGNED` if it does not exist, and `lastClientMessageAt` is set.
4. **Status update:** look the message up by `byWaMessageId` and update `status`. Statuses only move forward, so a late `delivered` never overwrites `read`.
5. Return `200` quickly. Meta retries anything that is not a `200`.

### 5.2 Appending a message (`packages/core/messages/append.js`)
All writes use one `TransactWriteItems` call:
- **Put** `Messages` item with `prevMessageId = <current head>`, condition `attribute_not_exists(messageId)`.
- **Update** `Chats` setting `headMessageId = <new id>`, condition `headMessageId = <current head>` (or `attribute_not_exists` for a new chat).

If the transaction is cancelled because the head changed, re-read the head and retry, up to 5 times. If it is cancelled because the message already exists, treat it as a duplicate. This keeps the list consistent when an inbound and an outbound message race.

### 5.3 Outbound (Next.js API + sender Lambda)
1. `POST /api/chats/[phone]/messages`:
   - Check access: the user is the assignee, or the user is an admin.
   - Check the 24-hour window from `lastClientMessageAt`; if it has expired, return `409 WINDOW_EXPIRED`.
   - Call `appendMessage()` with status `pending`.
2. Send `{ messageId, chatId }` to SQS FIFO with `MessageGroupId = chatId` and `MessageDeduplicationId = messageId`.
3. `sender` Lambda: load the message, call the Cloud API, then save `waMessageId` and set `status = sent`.
4. On error, the Lambda throws, so SQS retries. `maxReceiveCount: 3` then moves the message to the DLQ. On the last attempt the Lambda sets `status = failed`.

### 5.4 Polling
- Chat list: `GET /api/chats` every ~5 s.
- Open conversation: `GET /api/chats/[phone]/messages` every ~3 s. The response includes `headMessageId`, so the client refetches only when the head changes. Statuses are refreshed for the visible page.
- Older history: `?before=<messageId>` walks `prevMessageId` back 30 messages per page. This uses BatchGet over known IDs where possible, otherwise sequential gets. That is acceptable for v1; caching pages is a later step.

### 5.5 Auth
- `POST /api/auth/login` checks the bcrypt hash and sets an `httpOnly`, `SameSite=Lax` cookie holding a JWT (`sub`, `role`) that expires after 8 h.
- `middleware.js` protects pages; route handlers re-check the role.
- `scripts/seed-admin.js` creates the first admin: `npm run seed -- <email> [name]`. It generates the password and prints it once; change it after the first sign-in.
- The JWT signing key is the SSM parameter `/vartalap/<stage>/JWT_SECRET` (created by the stack), read at runtime by `apps/web/lib/session.js` and cached 5 min.

## 6. Environment and local development
- **AWS side:** `cd services/whatsapp && npx serverless deploy --stage dev`. This creates the tables, queue, DLQ and both Lambdas, and prints the webhook URL to register in the Meta app.
- **Web app:** `npm run dev -w apps/web` on localhost. It uses AWS credentials from the `assume` CLI session and the same `dev` table and queue names.
- **Table/queue naming:** `vartalap-<stage>-messages`, `vartalap-<stage>-chats`, `vartalap-<stage>-users`, `vartalap-<stage>-outbound.fifo`.

Environment variables (listed in `.env.example`; real values never committed):
| Var | Used by |
|---|---|
| `AWS_REGION`, `STAGE` | all |
| `MESSAGES_TABLE`, `CHATS_TABLE`, `USERS_TABLE`, `OUTBOUND_QUEUE_URL` | Lambdas get them from `serverless.yml`. The web app and seed script load them at startup from SSM `/vartalap/<STAGE>/config/*` (`loadConfigFromSsm` in core, called from `apps/web/instrumentation.js`) |
| `JWT_SECRET_PARAM` (optional; defaults to `/vartalap/<STAGE>/JWT_SECRET` in SSM) | web |
| `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` | Lambdas |
| `WA_GRAPH_VERSION` | Lambdas (plain value in `serverless.yml`, e.g. `v26.0`) |
| (none) | seed script: email and name are command-line arguments |

In AWS, the WhatsApp settings are SSM `String` parameters that the stack itself creates, with a placeholder value. The real values are set once after the first deploy. Lambdas get only the parameter names and read the values at runtime (`services/whatsapp/src/lib/params.js`); see `services/whatsapp/README.md`.

## 7. Root scripts
| Script | Does |
|---|---|
| `npm run dev` | Starts Next.js |
| `npm run deploy` | Runs `serverless deploy` for `services/whatsapp` |
| `npm run seed` | Runs `scripts/seed-admin.js` |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## 8. Build order
The build is split into modules M0–M9. See [`docs/modules/README.md`](../modules/README.md) for each module's scope, dependencies and phases.

## 9. Open points
1. ~~Deployment tool~~ **Decided (2026-10-17):** Serverless Framework v4. The deploying business needs a Serverless account and, if its annual revenue is above USD 2M, a paid license.
2. **Node version:** Node 22, unless the target AWS account requires something else.
3. ~~AWS region~~ **Decided (2026-10-17):** `ap-south-1` (Mumbai) is the default in `serverless.yml`; override with `--region`.
