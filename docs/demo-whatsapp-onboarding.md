# Demo: self-serve WhatsApp onboarding (I3, localhost)

Status: demo build · 2026-10-18 · Proposal: [`icebox/i3-whatsapp-onboarding.md`](icebox/i3-whatsapp-onboarding.md)

This runbook shows I3 end to end, from **Connect WhatsApp** to a live client chat. It needs no business verification and no App Review. It is **not production ready** (see [§7](#7-what-is-not-production-ready)).

**Why this works without verification:** a Meta app in **development mode** gets standard access to `whatsapp_business_management` and `whatsapp_business_messaging`. Embedded Signup then works for anyone with an **admin, developer or tester role on the app**. Verification and App Review (advanced access) are needed only to onboard businesses outside that circle.

## 1. What runs where

| Piece | Where | Change for the demo |
|---|---|---|
| Web app (settings page, onboarding API) | `https://localhost:3000` (`npm run dev:https`) | New page **WhatsApp** (`/admin/whatsapp`) and `/api/wa/onboarding/*` |
| Webhook, sender, mediaFetch Lambdas | AWS `dev` stack (unchanged URL) | Shorter SSM cache on dev (30 s); the webhook re-reads the number ID when it sees an unknown one |
| Meta webhooks | The Meta app's existing callback URL (stack output `WebhookUrl`) | None: `subscribed_apps` routes the new WABA's events there |

No tunnel is needed. Meta calls the AWS webhook, not localhost.

**What "connect" does** (`apps/web/lib/wa-onboarding.js`):
1. The browser runs Embedded Signup v4 in Meta's popup and gets a short-lived code, plus the WABA and number IDs.
2. The server exchanges the code for a business token, checks that the token can see that WABA and number, calls `POST /<WABA>/subscribed_apps`, and registers the number with a random 6-digit PIN.
3. The server overwrites SSM `WA_ACCESS_TOKEN` and `WA_PHONE_NUMBER_ID`, which all three Lambdas read. The previous manual values are saved first, so **Disconnect** puts them back.

Each step is recorded in SSM `/vartalap/dev/onboarding/CONNECTION` (SecureString). A failed attempt resumes with **Retry** and needs no new signup.

## 2. One-time Meta set-up (about 30 min)

Use the same Meta app whose webhook already points at the dev stack (`docs/deployment.md` §6). Its app secret is already in SSM `WA_APP_SECRET`.

1. **App type and mode.** The app must be a **Business** type app in **Development** mode. Note the **App ID** (App settings → Basic).
2. **Roles.** The Facebook account that will click through the demo needs an admin, developer or tester role (App roles → Roles). A tester has to accept the invite first.
3. **Facebook Login for Business.** Add the product if it is missing. Under *Settings → Client OAuth settings*:
   - Set to **Yes**: Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded browser OAuth login, Use Strict Mode for redirect URIs, Login with the JavaScript SDK.
   - **Allowed Domains for the JavaScript SDK:** `https://localhost:3000`
   - **Valid OAuth Redirect URIs:** `https://localhost:3000/`
4. **Embedded Signup configuration.** Go to Facebook Login for Business → *Configurations* → *Create configuration*. Pick the **WhatsApp Embedded Signup** login variation. Include WhatsApp accounts as assets, and the `whatsapp_business_management` and `whatsapp_business_messaging` permissions. Copy the **Configuration ID**. The menu labels are from Meta's docs; the console may word them differently.
5. **Webhook fields.** The `messages` field must still be subscribed (WhatsApp → Configuration).
6. **Demo phone number.** Use a SIM that can receive an SMS or a call and is **not** on WhatsApp or WhatsApp Business. If it is, delete that account in the app first. You also need a second phone with WhatsApp to play the client.

## 3. Deploy and configure

```bash
assume <dev-role>                                  # your usual AWS credentials
npm run deploy -- --stage dev                      # Lambda + CORS changes for the demo
```

Add these to `apps/web/.env.local`, next to `AWS_REGION` and `STAGE`:

```bash
META_APP_ID=<app id>
META_ES_CONFIG_ID=<configuration id>
```

> `npm run reset-data -w @vartalap/scripts -- --apply` trims `.env.local` back to `AWS_REGION` and `STAGE`. If you reset before the demo (recommended, for a clean inbox), add these two lines afterwards.

## 4. Run

```bash
npm run dev:https          # https://localhost:3000; the first run may ask for your password to trust a local certificate
```

Sign in as an admin. **WhatsApp** is in the top bar.

## 5. Demo script (about 5 min)

1. **WhatsApp page.** The *Number in use* card shows today's manual set-up, or *Not connected*. If a number is already connected through signup, disconnect it first.
2. Click **Connect WhatsApp**. In Meta's popup:
   - log in;
   - pick or create the business portfolio;
   - create a new WhatsApp Business Account;
   - enter the display name;
   - add the demo number and enter the OTP.
3. The popup closes. The page ticks through *token issued → account checked → webhooks subscribed → number registered → Vartalap is using the number*. That takes about 5–10 s.
4. The *Number in use* card now shows the new number, display name, quality rating and messaging limit, with the badge *Connected via signup*.
5. **Try it end to end:** from the second phone, send *Hi* to the new number (or use **Open WhatsApp**). Within a few seconds the card shows *Message received*. **Open the chat**, assign it and reply. The reply arrives on the phone.

Talking points:
- No IDs or tokens were copied by hand.
- The customer's business pays Meta directly; we are a Tech Provider, not a Solution Partner (I3 D2).
- Production adds multi-tenancy (I2) and proper secret storage (I6) on top of this same flow.

## 6. Reset and troubleshooting

- **Undo:** use **Disconnect** on the WhatsApp page. It unsubscribes the app from the WABA and restores the previous manual number and token, or the placeholder if there was none. The number stays registered with the Cloud API, and its PIN is kept in `/vartalap/dev/onboarding/PINS`, so it can be connected again.
- **The popup is blocked** or nothing happens: allow popups for `localhost`. Ad blockers can also block `connect.facebook.net`.
- **"URL blocked" or "domain not allowed"** in the popup: check §2 step 3. Meta's docs don't say whether `localhost` is accepted (**unverified**). If it is refused, serve the app over an HTTPS tunnel:
  - run `cloudflared tunnel --url https://localhost:3000 --no-tls-verify`;
  - put the tunnel's `https://….trycloudflare.com` domain into §2 step 3 in place of localhost;
  - open the app on that URL.
  
  Media uploads won't work on the tunnel URL, because the S3 CORS rule lists only localhost. Text messages are fine.
- **Stopped at "Number registered":** the number already has a two-step verification PIN from an earlier set-up. Enter it in the retry box and click **Retry**. You can also turn two-step verification off in WhatsApp Manager and retry with the box empty.
- **Stopped at another step:** click **Retry**. It resumes from that step with the stored token. If the token itself has expired, use **Discard attempt** and connect again.
- **The message doesn't arrive:** check the webhook logs (`npx serverless logs -f webhook --stage dev`):
  - `phone_number_id_refreshed` means the new number was picked up;
  - `item_skipped` with `other_phone_number_id` means SSM still holds another number;
  - no log at all means the WABA isn't subscribed (connect again) or the app's webhook URL is wrong.
- **Limits on a new, unverified portfolio:** 250 unique users per 24 h for business-initiated messages. Replies inside the 24 h window don't count. The display name may show as pending review, and the client then sees the number instead.

## 7. What is not production ready

These are the gaps between this build and the I3 proposal:

| Area | Demo build | Production (I3 and its dependencies) |
|---|---|---|
| Meta status | Development mode; only people with a role on the app | Business verification, App Review, advanced access (I3 phase 0) |
| Tenancy | One number per stage; connecting replaces the number the Lambdas use | `WaNumbers` per workspace, routed by `phone_number_id` (I2) |
| Secrets | Business token in SSM `String` `WA_ACCESS_TOKEN` (as today) and in the SecureString `onboarding/CONNECTION`; PIN in SecureString | Encrypted secret store, `tokenRef` per number (I6) |
| State check | Random `state` in an HttpOnly cookie for the browser session | `state` bound to the workspace and session, single use, stored server side |
| Health | Live read when the page loads | Daily health job, `account_update` and quality webhooks, reconnect banner (I3 §4.3) |
| Disconnect | Unsubscribe, restore the previous SSM values | Mark the number disconnected, block sends, keep chats readable per retention (I7) |
| Hosting | `https://localhost:3000` with a self-signed certificate | Real domain (I1); the web app's IAM role needs `ssm:GetParameters`/`PutParameter`/`DeleteParameter` on `/vartalap/<stage>/WA_*` and `/onboarding/*` |
| Business profile, multiple numbers, migration, coexistence | Not built | I3 phases 2–3 |
