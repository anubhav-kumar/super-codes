# I12: Public API, Outbound Webhooks and Integrations

Status: Research · 2026-10-17 · Depends on: I2 (workspaces), I6 (API keys in audit log, roles) · Related: F5 (templates via API), I5 (Business plan), I7 (export), I9 (rate limits, monitoring)

## 1. Goal
Businesses already have systems: a booking engine, a CRM, a helpdesk, an ERP. They will pay more, and churn less, if Vartalap connects to them: "send the booking confirmation template when a booking is made", "create a CRM contact when a new client writes", "show the client's open bookings next to the chat". I12 exposes a versioned, documented public API with API keys, signed outbound webhooks for events, and a small set of first-party integrations, so customers (or their developers) can automate without asking us.

**Who it's for:** customers' developers and ops teams; partners. **Out of scope:** a marketplace of third-party apps, and a chatbot builder.

## 2. Current state
- **Internal API only:** Next.js routes under `apps/web/app/api/` authenticate with the session cookie (`apps/web/lib/api.js:72-87`); there is no token-based auth, no versioning, no public documentation, no rate limiting.
- **Contracts exist:** Zod schemas in `packages/core/src/schemas/` and the API table in `docs/modules/m0-foundation.md` define request/response shapes, and F3's views (`toChatView`, `toMessageView`) already define what leaves the API without internal fields. These are a good base for a public contract.
- **No outbound events:** nothing notifies other systems when a message arrives, a chat is assigned or a status changes.
- **Errors:** a consistent `{ error: { code, message, details? } }` body with fixed codes (`VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `WINDOW_EXPIRED`, `INTERNAL`) (F4 §2), suitable for a public API as is.

## 3. Research findings
- **API key practice:** show the secret once, store only a hash, use a recognisable prefix so leaked keys can be detected by secret scanners, scope keys to least privilege, support rotation with overlap (OWASP REST Security Cheat Sheet, [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)). GitHub secret scanning partner program can alert on leaked keys with a known format ([GitHub secret scanning partners](https://docs.github.com/en/code-security/secret-scanning/secret-scanning-partnership-program/secret-scanning-partner-program)).
- **Webhook signing:** an HMAC-SHA256 signature over a timestamp and the raw body, with a tolerance window to stop replays, is the de facto standard (Stripe's scheme, [Stripe webhook signatures](https://docs.stripe.com/webhooks#verify-events); the [Standard Webhooks](https://www.standardwebhooks.com/) specification). Meta's own `X-Hub-Signature-256` (already verified in `services/whatsapp/src/whatsapp/signature.js`) follows the same idea.
- **Delivery reliability:** at-least-once delivery with retries and exponential backoff, idempotency keys on events, and a way for customers to see and replay failed deliveries are expected (Standard Webhooks; Stripe docs).
- **OpenAPI 3.1** as the machine-readable contract enables generated docs and client SDKs ([OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0)); Zod schemas can generate it (e.g. `zod-to-openapi`, **unverified** compatibility with the repo's Zod version).
- **Integration platforms:** Zapier and Make let non-developers connect apps through a published app definition backed by our API and webhooks ([Zapier Platform](https://docs.zapier.com/platform/home)). Common CRM targets in the market: HubSpot, Salesforce, Zoho (**unverified** priority for the target customers; ask prospects).

## 4. Proposed design

### 4.1 Public API (`/v1`)
- Served from the same web app under `/api/v1/*` (I1 host), separate route handlers that reuse core functions and F3 views. Never the internal routes, so UI changes don't break customers.
- **Auth:** `Authorization: Bearer vtl_live_<random>` (and `vtl_test_` for test workspaces). Keys belong to the workspace, are created by owners/admins, have a name, scopes, optional expiry and IP allow-list, and show `lastUsedAt`. Stored as SHA-256 hash; the secret is shown once.
- **Scopes:** `chats:read`, `messages:read`, `messages:send`, `templates:read`, `templates:send`, `contacts:write` (F4 attributes, consent), `webhooks:manage`.
- **Acting identity:** an API key acts as a system user; sends are labelled "Sent via API (<key name>)" in the UI, like "sent by admin" today. Optionally, `onBehalfOf` an agent for attribution (D3).
- **Resources (v1):**
  | Method + path | Purpose |
  |---|---|
  | `GET /v1/chats?status=&assignedTo=&updatedSince=` | List chats (opaque IDs, F3) |
  | `GET /v1/chats/:id/messages?before=` | Read history |
  | `POST /v1/messages` `{ to (E.164) \| chatId, text \| template, phoneNumberId? }` | Send text (window must be open) or a template (consent checked, F5); creates the chat if needed |
  | `GET /v1/messages/:id` | Status |
  | `PUT /v1/chats/:id/assign` | Assign (by user ID or email) |
  | `PUT /v1/chats/:id/status` | Open/pending/resolve (I10) |
  | `PATCH /v1/contacts/:phone` | Description, tags, consent, external IDs (F4, F5) |
  | `GET /v1/templates` | Approved templates and variables |
  | `GET/POST/DELETE /v1/webhooks` | Manage webhook endpoints |
- **Phone numbers in the API:** API clients are trusted integrations of the customer and may send and receive E.164 numbers (their systems key clients by phone). Responses include `phone` only for keys with the `contacts:pii` scope (D2), keeping F3's protection for narrower integrations.
- **Idempotency:** `Idempotency-Key` header on `POST`, stored 24 h, so retries don't send twice.
- **Rate limits:** per key and per workspace (e.g. 10 req/s burst, 600/min), returned in `RateLimit-*` headers; `429` with `Retry-After`. Sends also respect the per-workspace send limits (I2 §4.4, F5 §4.5).
- **Versioning:** `/v1` is frozen for additive changes only; breaking changes go to `/v2` with 12 months of overlap (D4).
- **Docs:** OpenAPI 3.1 generated from the Zod schemas; a public docs site with examples in curl and JavaScript; a Postman collection.

### 4.2 Outbound webhooks
- Endpoints per workspace (`WebhookEndpoints`: URL (HTTPS only), events, secret, active, failure count).
- **Events:** `message.received`, `message.sent`, `message.status_updated` (delivered/read/failed), `chat.created`, `chat.assigned`, `chat.status_changed`, `template.status_updated`, `contact.opted_out`.
- **Payload:** `{ id, type, createdAt, workspaceId, data }`; `data` uses the public API's shapes. Message text is included only if the endpoint has the `include_content` option (D5).
- **Signing:** `webhook-id`, `webhook-timestamp`, `webhook-signature` (HMAC-SHA256 over `id.timestamp.body`), compatible with Standard Webhooks so customers can use existing verifier libraries.
- **Delivery:** from the DynamoDB Streams publisher (shared with I8) to an SQS queue → delivery Lambda. Retries with exponential backoff over ~24 h (e.g. 5 s, 1 min, 10 min, 1 h, 6 h, 12 h); then the event is marked failed. After many consecutive failures the endpoint is disabled and admins are emailed.
- **SSRF protection:** the delivery Lambda runs outside the VPC with no access to internal resources, resolves the hostname and rejects private, loopback and link-local addresses, and doesn't follow redirects.
- **UI:** Settings → Developers: endpoints, recent deliveries with status codes, "resend", signing secret rotation.

### 4.3 First-party integrations (Phase 3, pick by demand)
- **Zapier app** (triggers = webhook events; actions = send template, assign, add tag) covers hundreds of tools with one build.
- **Context panel ("client details from your system"):** a workspace configures a URL that Vartalap calls server-side with the chat's phone number and an HMAC signature when an agent opens a chat; the response (title + key/value list + links) renders in F4's client panel. Gives agents booking or order context without a native integration per system.
- **Native CRM sync** (HubSpot first, if prospects use it): contacts and a conversation timeline entry; OAuth app.

### 4.4 Security and governance
- API key create/revoke/use-from-new-IP events in the audit log (I6).
- Keys never logged; requests logged with key ID and `requestId` only (I9).
- Key leak response: prefix-based detection via GitHub secret scanning partnership (Phase 3), plus instant revoke.
- Data processed by customers' systems through the API is outside our control; the DPA (I7) states that the customer is responsible for systems it connects.

## 5. Affected modules and files
- **Core:** new `api-keys/` (hash, verify, scopes), `webhooks/` (endpoints, event shapes, signing), `idempotency/`; views reused from F3; `messages` send path shared with the internal route.
- **M7:** new `apps/web/app/api/v1/**` route handlers; `lib/api.js` gains `requireApiKey(request, scope)` and rate limiting; OpenAPI generation script.
- **M1:** `serverless.yml` (tables `ApiKeys`, `WebhookEndpoints`, `WebhookDeliveries`, `Idempotency`; delivery queue and Lambda; Streams wiring shared with I8/I11).
- **New service code:** `services/whatsapp/src/handlers/deliver-webhook.js`.
- **M8:** Settings → Developers (keys, webhooks, deliveries); "Sent via API" label.
- **Docs:** public API reference (OpenAPI), webhook verification guide, Zapier app listing.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Which plan includes the API? | **Business and Dedicated** (I5); read-only API on Starter could be a later upsell lever |
| D2 | Phone numbers in API responses? | **Only with the `contacts:pii` scope**; sending by phone is always allowed |
| D3 | API sends attributed to whom? | **The API key (system user) by default**, optional `onBehalfOf` agent |
| D4 | Versioning policy? | **Path versioning, additive changes only within a version, 12-month deprecation window** |
| D5 | Message text in webhooks? | **Opt-in per endpoint** (`include_content`), off by default, to limit personal data leaving the platform |
| D6 | First integration to build? | **Zapier**, then the context panel; native CRMs only on proven demand |

## 7. Risks
- **Breaking customers' integrations** when internals change: separate `/v1` handlers and contract tests on the OpenAPI document.
- **Abuse via API sends** (spam, policy violations): consent checks (F5), rate limits, per-workspace send caps, and suspension tools (I2).
- **Webhook delivery to customer endpoints** can be slow or down; queues isolate it from the core path, and endpoint auto-disable prevents endless retries.
- **SSRF** through customer-configured URLs (webhooks, context panel): strict egress checks as in §4.2.
- **PII leaving the platform** through webhooks and API: scoped keys, content opt-in, DPA language.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. API foundation | API keys with scopes and hashing; `/v1` chats, messages (send text/template, status), templates; idempotency; rate limits; OpenAPI + docs site | M |
| 2. Webhooks | Endpoints, events, Standard Webhooks signing, delivery queue with retries, delivery log and resend, SSRF protection | M |
| 3. Integrations | Zapier app; context panel; contact attributes and consent endpoints; key-leak scanning | M |
| 4. Optional | Native CRM sync (HubSpot), SDK packages | M–L |

## 9. Acceptance criteria
- [ ] An owner creates an API key with `messages:send`; a `POST /v1/messages` with a template sends it and returns a message ID; the same request with the same `Idempotency-Key` returns the same result without a second send.
- [ ] A key without `chats:read` gets `403` on `GET /v1/chats`; a revoked key gets `401` within 30 s of revocation.
- [ ] A key from workspace A can't read or send for workspace B's chats or numbers.
- [ ] A registered webhook receives `message.received` within 5 s of an inbound message, with a signature that verifies using a Standard Webhooks library; a `500` from the endpoint is retried with backoff and shows in the delivery log.
- [ ] Webhook URLs pointing at private IPs or `localhost` are rejected at creation and at delivery time.
- [ ] No API key secret appears in any log, response (after creation) or DynamoDB attribute in plain text.
