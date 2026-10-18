# I3: Self-Serve WhatsApp Number Onboarding (Tech Provider, Embedded Signup)

Status: Research; localhost demo built 2026-10-18 ([`docs/demo-whatsapp-onboarding.md`](../demo-whatsapp-onboarding.md)) · Depends on: I2 (workspaces, `WaNumbers`), I6 (secret storage) · Related: I1 (domains), F5 (templates), I5 (trial)

## 1. Goal
Today, connecting a business's number means the business creates its own Meta app, copies a phone number ID, a token, an app secret and a verify token into SSM, and registers our webhook URL by hand (`docs/deployment.md` §3, §6). No paying customer will do that, and it hands us their app secret. I3 makes it a two-minute in-app flow: the customer clicks **Connect WhatsApp**, logs in to Facebook in Meta's popup, picks or creates their WhatsApp Business Account and number, and Vartalap is live, using **our** Meta app as a registered Tech Provider.

**Who it's for:** a workspace admin during signup or later in settings; you, as the Meta Tech Provider. **Out of scope:** acting as a Solution Partner that pays Meta on customers' behalf (D2), and migrating a number from another provider beyond Meta's standard flow (Phase 3).

## 2. Current state
- **Per-deployment Meta credentials:** four SSM parameters per stage, `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, created with a `CHANGE_ME` placeholder and filled by hand (`services/whatsapp/serverless.yml:175-208`; `services/whatsapp/README.md` §WhatsApp settings).
- **The customer owns the Meta app:** the deployment guide tells the business to configure the webhook in *its* Meta developer app (`docs/deployment.md` §6) and to use a System User token (`docs/deployment.md` §3 table).
- **One number only:** the webhook skips any `phone_number_id` that isn't the configured one (`services/whatsapp/src/handlers/webhook.js:50`).
- **Secrets are SSM `String`** (CloudFormation can't create `SecureString`), protected by IAM only (`services/whatsapp/README.md:35`).
- **External prerequisite** listed for the single-business trial: "the client business sets up its Meta WhatsApp Business account" (`docs/modules/README.md`).

## 3. Research findings
All from Meta's developer documentation, checked 2026-10-17 (research agent; links below).
- **Becoming a Tech Provider** ([Get started for Tech Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)):
  - Business verification of *our* business must be completed before App Review.
  - App Review needs two screen recordings: sending a message and creating a template.
  - Approval grants **advanced access** to `whatsapp_business_messaging` and `whatsapp_business_management`. Customers can only grant these permissions to our app once we have advanced access.
- **Embedded Signup flow** ([Onboarding customers as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider)):
  1. Our page launches Embedded Signup (Facebook JS SDK). The customer logs in and selects or creates a business portfolio, WABA and phone number (with OTP verification of the number).
  2. The SDK returns an **exchangeable code**. The WABA ID and phone number ID come from the session-logging message event listener (or an API call).
  3. Our server exchanges the code with `GET /oauth/access_token` for a **business integration system user token** ("business token"). Tech Providers use business tokens only.
  4. Subscribe our app to the WABA's webhooks: `POST /<WABA_ID>/subscribed_apps`.
  5. Register the number for Cloud API: `POST /<PHONE_NUMBER_ID>/register` with a 6-digit PIN, which becomes the number's two-step verification PIN.
  6. The customer adds a payment method in WhatsApp Manager (needed for template sends, F5).
- **Version deadline:** Embedded Signup **v2 was deprecated on 2026-10-15**. Build on v4.
- **Billing:** by default the customer pays Meta through the payment method on their own WABA. Sharing a credit line (being the "Bill To Party") is a **Solution Partner** feature, not available to Tech Providers ([Share and revoke credit lines](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/share-and-revoke-credit-lines/)).
- **Webhooks for many customers:** our one app webhook receives all subscribed WABAs' events; payloads identify `phone_number_id` and WABA. Webhook overrides per WABA/number exist if a dedicated stack (I2 D1) needs its own endpoint ([Webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)).
- **Limits a new number starts with:** messaging limits are per business portfolio (since 2025-10-07); an unverified portfolio starts at 250 unique users per 24 h for business-initiated messages, 2,000 after business verification ([Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)). Replies inside the 24 h window don't count.
- **Unverified:** the business token's expiry (the page doesn't state it) and whether a separate "access verification" step still exists for Tech Providers. Confirm during our own App Review.

## 4. Proposed design

### 4.1 Our Meta set-up (one-time, operator)
- One Meta app per environment group: `Vartalap (prod)` and `Vartalap (non-prod)`, each with its own app secret, webhook URL (I1 domains) and verify token.
- Business verification of our legal entity; App Review for the two permissions; Embedded Signup v4 configuration (configuration ID).
- The app secret and verify token stay global secrets (I6 storage). The per-customer secret is only the business token.

### 4.2 In-app flow
1. **Settings → WhatsApp → Connect number** (admin only). A checklist shows prerequisites: a Facebook account with admin rights on the business, a phone number not active on another WhatsApp account (or ready to migrate), and the business's display name.
2. Launch Embedded Signup v4 with our configuration ID; `extras` carries a one-time `state` bound to the workspace and the admin's session.
3. On success, the browser posts `{ code, wabaId, phoneNumberId, state }` to `POST /api/wa/onboarding/complete`.
4. The server (never the browser):
   - validates `state`;
   - exchanges `code` for the business token;
   - stores the token in the secret store (I6), referenced by `tokenRef`;
   - calls `subscribed_apps` on the WABA;
   - generates a random 6-digit PIN, calls `register`, stores the PIN encrypted (needed for later re-registration);
   - reads number details (`display_phone_number`, `verified_name`, quality rating, name status) and writes the `WaNumbers` item with `workspaceId` (I2).
5. The UI shows **Connected**, the display name status, the current messaging limit, and "Add a payment method in WhatsApp Manager" with a link (needed before templates, F5).
6. **Test message:** the admin sends "hi" from their own phone; the chat appears in Unassigned (proves webhook routing end to end).

Steps 4.x are idempotent and resumable: an `Onboarding` record per attempt holds the step reached, so a failure after the token exchange can be retried without asking the customer to start again.

### 4.3 Number health and management
- A daily job per number reads quality rating, messaging limit (`whatsapp_business_manager_messaging_limit`; `messaging_limit_tier` is deprecated), name status and account review status, and stores them on `WaNumbers`. Subscribe to the `account_update`, `phone_number_quality_update` and `phone_number_name_update` webhook fields as well.
- Settings show each number's status; a quality drop to Yellow/Red notifies admins (I8).
- **Disconnect:** unsubscribe our app from the WABA (`DELETE /<WABA_ID>/subscribed_apps`), delete the token, mark the number `disconnected`. Chats remain readable per retention (I7); sends are blocked.
- **Profile:** edit the WhatsApp business profile (about, description, address, email, websites, profile photo) through the API from settings.

### 4.4 Dedicated stacks and manual mode
- A dedicated stack (I2 D1) can still use the manual SSM set-up as today, for customers who insist on their own Meta app. It becomes one `WaNumbers` row whose `tokenRef` points to their SSM parameter, so the code path is the same.

### 4.5 Security
- Codes and tokens never reach the browser after the exchange, never get logged, and are stored encrypted (I6).
- `state` prevents a malicious page from attaching its WABA to someone else's workspace (CSRF).
- A number can be connected to only one workspace: the `WaNumbers` PK is `phoneNumberId`, written with `attribute_not_exists`.
- Each business token is scoped by Meta to the customer's assets; one customer's token can't act on another's WABA.

## 5. Affected modules and files
- **New core:** `packages/core/src/wa-numbers/` (onboarding steps, health), `whatsapp/graph.js` (Graph API client moved from `services/whatsapp/src/whatsapp/client.js`, shared by web and Lambdas).
- **M5:** `webhook.js` handles `account_update`, quality and name-update fields; routes by `phone_number_id` (I2).
- **M6:** `sender.js` resolves the token by `tokenRef`.
- **M1:** `serverless.yml` (`Onboarding` table or items, health job schedule, IAM for the secret store); the four global `WA_*` parameters become app-level (`WA_APP_SECRET`, `WA_VERIFY_TOKEN`) plus per-number secrets.
- **M7:** `app/api/wa/onboarding/complete/route.js`, `app/api/wa/numbers/*` (list, refresh, disconnect, profile).
- **M8:** settings page "WhatsApp" with the connect button (Facebook SDK loaded only on that page), number cards and health.
- **Docs:** `docs/deployment.md` (manual mode becomes the dedicated-stack appendix), new `docs/meta-tech-provider.md` (our one-time set-up and App Review evidence).

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Register as a Tech Provider now? | **Yes, start immediately.** Business verification and App Review are on the critical path for the first self-serve customer and can take weeks (**unverified** duration) |
| D2 | Tech Provider or Solution Partner (paying Meta for customers and re-billing)? | **Tech Provider.** Customers pay Meta directly; we avoid credit risk and Meta billing reconciliation. Revisit at scale (margin opportunity, I5 D4) |
| D3 | Allow numbers that also use the WhatsApp Business app (coexistence)? | **Phase 3, after checking Meta's current coexistence rules.** Note such numbers get 20 msg/s throughput instead of 80 |
| D4 | How many numbers per workspace? | **1 on Starter, 3 on Business, more on request** (I5) |
| D5 | Keep the manual (own Meta app) path? | **Yes, only for dedicated stacks** |

## 7. Risks
- **Meta approval delays or rejection** block self-serve onboarding entirely. Mitigation: apply now; until approved, onboard early customers manually on dedicated stacks (§4.4).
- **API and flow changes:** Meta deprecates Embedded Signup versions (v2 ended 2026-10-15). Track the changelog; pin the Graph API version (`WA_GRAPH_VERSION`) and upgrade on a schedule.
- **Number migration:** a number active on the WhatsApp app or another provider must be moved first; customers will get stuck. Provide a help article and a support path (I9).
- **Display name rejection** limits what the business shows to clients; surface the status clearly.
- **Token loss or revocation** (the customer removes our app in Business Settings) silently breaks sends. The daily health check and the I9 token canary per number catch it; admins get a "reconnect" banner.
- **Policy liability:** as a Tech Provider we must ensure customers follow WhatsApp policies (opt-in, F5). Our terms of service must pass these obligations on (I7).

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 0. Meta paperwork (no code) | Business verification, Meta apps per environment, App Review videos (on `dev` with a test number), Embedded Signup v4 configuration | S (calendar time: weeks) |
| 1. Connect flow | Settings page with Embedded Signup; server exchange, subscribe, register; `WaNumbers` + secret storage; resumable onboarding; test-message check | M |
| 2. Manage | Health job and webhooks; disconnect; business profile editing; multiple numbers per workspace | M |
| 3. Edge cases | Number migration guidance; coexistence (D3); re-registration with stored PIN; dedicated-stack manual mode as a `WaNumbers` row | S–M |

## 9. Acceptance criteria
- [ ] A new workspace admin with a fresh test number connects it through Embedded Signup in under 5 minutes, with no copying of IDs or tokens.
- [ ] After connecting, a message from a phone to that number appears in that workspace's Unassigned list and in no other workspace.
- [ ] The business token is not present in any browser response, log line or DynamoDB attribute in plain text.
- [ ] Re-submitting the same completion request (or retrying after a failure at the register step) does not create a second number record or a second subscription.
- [ ] Trying to connect a `phoneNumberId` already connected to another workspace fails with a clear message.
- [ ] Revoking our app in the customer's Business Settings shows a "reconnect" banner within 24 h (health job) and blocks sends with a clear error.
- [ ] Disconnecting a number stops inbound routing and sends for it; existing chats stay readable.
