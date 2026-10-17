# Product Description

## Product Name
Vartalap

## What are we building ?
We are building a chat application on top of WhatsApp. A business using this product can have multiple clients on WhatsApp and multiple employees who chat with those clients. Each client may be assigned to one of the employees.

This is a trial project built for a single business. It will be deployed on that business's own cloud, so the focus is on the product, not on deployment.

## Users and roles
There are two types of employees: agents and admins.

### Agents
- An agent sees only the chats assigned to them, and only that agent may message those clients via WhatsApp.
- When a chat is reassigned, the new agent sees the full history and the previous agent loses access.

### Admins
- Admins can see every chat, whether it is assigned to an agent, assigned to another admin, or unassigned.
- Admins can reply to any chat directly without reassigning it. These replies are labeled "sent by admin" in the Vartalap UI for agents and admins. The client does not see the label.
- Admins assign and reassign chats (see [Assignment](#assignment)).
- Admins can create other admins and agents, and can change their own password.

### Accounts and authentication
- Login uses a custom JWT.
- Users are stored in a `Users` table, with passwords hashed using bcrypt.
- A seed script creates the first admin with a default password.

## Chats
- A chat is one continuous conversation with one client, identified by the client's phone number. There are no sessions or tickets.
- Only the client can start a chat. The business does not start conversations.
- There is one WhatsApp number for the business.

### Assignment
- New chats arrive unassigned and are visible only to admins.
- An admin assigns a chat in one of two ways:
  - by picking an agent manually, or
  - by clicking "auto-assign", which picks the next agent in round-robin order.

### 24-hour messaging window
WhatsApp only accepts free-form replies within 24 hours of the client's last message. The window restarts each time the client sends a message.
- Each chat stores the time of the client's last message.
- When the window has expired, the backend rejects the send. The UI disables the message input and shows a "window expired" note.
- Template messages are out of scope.

## Messages
- Text messages only for v1. The schema should allow media to be added later.
- Each message stores its delivery status (`pending`, `sent`, `delivered`, `read`, `failed`), updated from WhatsApp status callbacks. The UI shows it.
- Inbound webhooks are deduplicated with a conditional write on the WhatsApp message ID.

## High level arch

### Components
| Component | Technology | Runs on |
|---|---|---|
| Web app (frontend + backend API) | Next.js (JavaScript), with API routes as the backend | localhost for now, connecting to DynamoDB on AWS through the already configured `assume` CLI |
| Inbound webhook | AWS Lambda | AWS, deployed with Serverless Framework |
| Outbound sender | AWS Lambda triggered by SQS | AWS, deployed with Serverless Framework |
| Outbound queue | SQS FIFO, `MessageGroupId = conversationId` (client phone number) | AWS |
| WhatsApp provider | Meta WhatsApp Cloud API | Meta |
| Database | DynamoDB | AWS |

The project is JavaScript only (no TypeScript).

### Data storage (DynamoDB)
Messages are stored as a linked list: every message points to the previous message in its chat.

| Table | Contents |
|---|---|
| `Messages` | One item per message, including `prevMessageId`, direction (inbound/outbound), sender (client, agent or admin), text, WhatsApp message ID, status and timestamp. |
| `Chats` | One item per chat, keyed by client phone number. Holds the **head**: the ID of the latest message, updated every time a new message arrives. Also holds the assigned user and the time of the client's last message. |
| `Users` | Agents and admins: role, credentials (bcrypt hash) and profile. |

To read a chat, start at the head in `Chats` and follow `prevMessageId` backwards through `Messages`, paging as you go.

Inbound and outbound messages can arrive for the same chat at the same time. Updating the head must therefore be a conditional write (compare-and-set on the current head), so that no message is dropped from the list.

### Inbound flow (client → Vartalap)
1. WhatsApp calls the inbound webhook Lambda.
2. The Lambda verifies the request, deduplicates on the WhatsApp message ID, formats the message and writes it to `Messages`.
3. The Lambda updates the chat's head and the time of the client's last message in `Chats`. A new client creates a new, unassigned chat.
4. The same Lambda handles WhatsApp status callbacks (sent, delivered, read, failed) and updates the message's status.

### Outbound flow (agent/admin → client)
1. The agent or admin sends a message from the UI to the Next.js API.
2. The API checks access and the 24-hour window. It then writes the message to `Messages` with status `pending` and updates the chat head.
3. The API sends the message ID to the SQS FIFO queue.
4. The outbound Lambda reads the queue and sends the message through the WhatsApp Cloud API.
5. A failed send is retried 3 times and then moved to a dead-letter queue (DLQ). The message is marked `failed`, so the UI can show it.

### UI updates
- v1 polls for new messages and status changes.
- WebSockets are a possible later step.

## Scope of v1
- Inbound webhook (messages and status callbacks)
- Outbound send through SQS and the Lambda
- Login, a seeded first admin, and admins creating admins and agents
- Listing chats (by role) and reading chat history
- Manual and round-robin assignment, and reassignment
- Admin replies labeled for internal users only
- Enforcing the 24-hour window
- A basic Next.js frontend

## Deferred
- Data retention, client data deletion, encryption-at-rest choices and log masking. These will be revisited before this moves beyond a trial, given GDPR, Singapore PDPA and Saudi PDPL.
- Media messages and template messages.
- WebSockets for real-time updates.
- Production deployment of the Next.js app.
