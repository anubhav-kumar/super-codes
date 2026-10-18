# F5: Template Messages, Opt-In/Opt-Out and Re-Engagement

Status: Research · 2026-10-17, updated 2026-10-18 (template lifecycle, preview, variable validation) · Builds on: M2, M4, M6, M7, M8 · Depends on: I2 (workspaces), I3 (numbers, payment method on WABA) · Related: F2 (media headers), I10 (status), I11 (template reports)

## 1. Goal
Today a conversation dies 24 hours after the client's last message: the composer is disabled and the agent can only wait (`docs/PRD.md` §24-hour messaging window). For a travel or service business that is the moment it most needs to reach the client ("your refund is processed", "your visa is ready", "we couldn't reach you"). Every paying customer will ask for this. F5 adds WhatsApp **template messages**: managed in Vartalap, sent by an agent to reopen a closed conversation, and later sent to many clients at once (broadcasts). It also adds the **opt-in and opt-out** records that WhatsApp policy requires before a business messages someone first.

**Who it's for:** agents (send a template to reopen a chat), admins (manage templates, broadcasts and consent). **Out of scope:** marketing automation journeys, chatbot flows (I10 D7), authentication (OTP) templates as a product (possible later via I12 API).

## 2. Current state
- **Window enforced, no way out:** `lastClientMessageAt` drives `isWindowOpen` (`packages/core/src/chats/window.js`); the API returns `409 WINDOW_EXPIRED`; the UI disables the composer (`docs/arch/boilerplate.md` §5.3; `apps/web/components/Conversation.js`). "Template messages are out of scope" (`docs/PRD.md` §24-hour messaging window, §Deferred).
- **Business can't start chats:** "Only the client can start a chat" (`docs/PRD.md` §Chats). There's no UI to create a chat with a phone number.
- **Sender sends text only:** `client.js` has `sendText`; the sender always sends `type: 'text'` (`services/whatsapp/src/handlers/sender.js`; F2 §2).
- **Message schema:** `type` is `text` (F2 extends it); there is no template reference or variable storage (`packages/core/src/schemas/message.js`).
- **Webhook:** only `messages` statuses and inbound messages are handled; `button` replies to templates arrive as `[unsupported: button]` (F2 §3.1). `message_template_status_update` is not subscribed.
- **No consent data:** nothing records whether a client opted in or out.

## 3. Research findings
Meta developer documentation and policy pages, checked 2026-10-17.
- **Outside the 24-hour window only approved templates may be sent** ([Templates overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)).
- **Template management API:** `POST /{WABA_ID}/message_templates` with `name`, `category` (`MARKETING`, `UTILITY`, `AUTHENTICATION`), `language`, `parameter_format` (named or positional) and components (header, body, footer, buttons). Every variable needs an example value. Creation is limited to 100 per WABA per hour. Review takes up to 24 h.
- **Statuses and quality:** Approved, In review, Rejected, Paused, Disabled, Appeal requested, plus `PENDING_DELETION` after a delete (see below); quality High/Medium/Low (GREEN/YELLOW/RED in the API). Changes arrive on the `message_template_status_update` webhook. A template that hits RED is **paused for 3 h the first time, 6 h the second, and disabled the third**; sends to a paused template fail and aren't billed ([Template pausing](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pausing)).
- **Count limits:** 250 templates per WABA for an unverified portfolio; up to 6,000 once verified with an approved display name. Templates unused for 12 months are archived, then deleted after 28 days.
- **Editing** ([Template management](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management), checked 2026-10-18):
  - Only `APPROVED`, `REJECTED` or `PAUSED` templates can be edited. Only the category, components or time-to-live can change. Name and language are not in that list, so they are treated as fixed; this is an inference, Meta doesn't say so explicitly.
  - An edit replaces **all** components, never a single one. The category of an approved template can't be changed.
  - An approved template can be edited **once per 24-hour window and 10 times per 30-day window**. Rejected or paused templates can be edited any number of times.
  - Every edit goes through review again ([Templates overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)).
- **Deleting** ([Template management](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management)):
  - `DELETE /{WABA_ID}/message_templates?name=…` deletes **every language** with that name. Adding `hsm_id` deletes only that one template, and `hsm_ids` deletes up to 100 by ID (one invalid ID fails the whole request).
  - Messages already sent move to `PENDING_DELETION`, and WhatsApp keeps trying to deliver them for 30 days.
  - After an **approved** template is deleted, its name can't be used for a new template for **30 days**.
  - **Disabled** templates can't be deleted.
  - Not stated by Meta (**unverified**): whether a template still in review can be deleted.
- **Component limits** ([Components](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components)): header text 60 characters with at most 1 variable; body 1,024 characters with any number of variables; footer 60; button label 25; URL 2,000. Values placed in URL buttons must be percent-encoded. Every variable needs a sample value at creation.
- **Variable rules at review** ([Template review](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review)): the template is rejected when variables have mismatched braces, contain `#`, `$` or `%`, aren't numbered sequentially, are too many for the message length, or come first or last in the template ("dangling parameters").
- **Named variables** ([Templates overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)): names are unique and made of lowercase letters and underscores, e.g. `{{client_name}}`. Meta doesn't say whether digits are allowed (**unverified**). Positional variables are `{{1}}`, `{{2}}`, … starting at 1.
- **Send-time errors** ([Error codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes)): `132000` variable count doesn't match the template, `132001` template missing in that language or not approved, `132005` translated text too long, `132007` policy violation, `132012` values formatted incorrectly, `132015` paused, `132016` disabled, `132018` "There's an issue with the parameters in your template", `131008` required parameter missing, `131009` invalid parameter value.
- **Whitespace in variable values (unverified):** Meta's pages checked here don't say which values cause `132018`. Several WhatsApp providers document the same rule: a variable value can't contain line breaks or tabs, or more than 4 spaces in a row ([Clickatell](https://guides.clickatell.com/clickatell-portal-user-guide/setup-your-channels-and-products/whatsapp/template-messages-hsm/best-practices-and-example-templates), [WATI](https://support.wati.io/en/articles/11463458-what-are-template-formatting-guidelines), [Trengo](https://help.trengo.com/article/conditions-for-whatsapp-templates)). An n8n user reproduced `132018` with a trailing line break ([n8n community](https://community.n8n.io/t/400-bad-request-using-whatsapp-templates-values-seems-to-not-be-valid/168096)). Vartalap enforces this rule anyway (§4.8), since it is cheap and avoids a failed send.
- **Pricing** ([Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)):
  - Per-message since **2025-07-01**: each delivered template is charged by category and recipient country code.
  - **Free:** non-template (service) messages inside the 24 h customer service window, **utility templates sent inside an open window**, and everything for 72 h after a Click-to-WhatsApp ad or Page call-to-action entry point.
  - Utility and authentication rates fall with monthly volume tiers per portfolio and market. Rates change often (2026-04-01 new billing currencies including SGD, SAR, AED, MYR; 2026-07-01 Singapore utility/authentication increase; 2026-10-01 updates for Kuwait, Oman, Iraq and others).
  - The customer pays Meta via the WABA's payment method (I3 D2).
- **Messaging limits:** business-initiated messages outside a window count against the portfolio's limit of unique users per rolling 24 h: 250 → 2,000 → 10,000 → 100,000 → unlimited, shared by all numbers in the portfolio since 2025-10-07 ([Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)).
- **Throughput:** 80 messages/s per number by default (20 if shared with the WhatsApp Business app); error `130429` when exceeded; a pair rate limit applies to messages to one user ([Throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput)).
- **Opt-in and opt-out policy** ([WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/), updated 2026-09-23):
  - A business may message a person only if the person gave their number and the business received opt-in. The business chooses how to collect it; separate opt-in per category is recommended.
  - Businesses "must respect all requests (on or off WhatsApp)" to block, stop or opt out.
- **Interactive replies:** quick-reply buttons on a template come back as inbound `button` messages with `payload` and `context.id` (F2 §3.1), which can drive opt-out ("Stop promotions").

## 4. Proposed design

### 4.1 Template library (per WABA)
- New table `Templates` (PK `workspaceId`, SK `wabaId#name#language`): Meta `templateId`, `category`, `status`, `qualityScore`, `rejectedReason`, `components` (JSON as returned by Meta), `parameterFormat`, `variables` (name, example, source mapping), `createdBy`, `updatedAt`, `lastUsedAt`.
- **Sync:** on I3 connect and every 6 h, `GET /{WABA_ID}/message_templates` (paged) reconciles with Meta, so templates made in WhatsApp Manager appear too. The `message_template_status_update` webhook updates status in near real time.
- **Variable sources:** each variable maps to a source: `client.name` (WhatsApp profile name), `agent.name`, `workspace.name`, an F4 attribute, or "ask the agent at send time". Each variable also has a label shown to the agent and an optional max length. How values are checked is in §4.8.

### 4.1a Template lifecycle on Meta (admins)
All of these call Meta's template management API and then update the `Templates` item. The status webhook and the 6-hourly sync stay the source of truth for status.
- **Create:** a form with category, language, header (text; media after F2), body with named variables (`{{client_name}}`), footer and buttons (quick reply, URL, phone). The form checks Meta's rules before submitting:
  - the length limits;
  - at most 1 variable in the header;
  - variable names in lowercase letters and underscores;
  - no `#`, `$` or `%` in variables;
  - no variable as the first or last thing in the template;
  - a sample value for every variable.

  The live preview (§4.7) shows the template with its sample values. Submitting sends it to Meta's review, and a status badge shows **In review → Approved / Rejected** with Meta's rejection reason.
- **Status check:** the badge comes from the `message_template_status_update` webhook (near real time) and the sync. Admins can also press **Refresh from Meta** on one template, which fetches it by ID. The picker in chats shows only `APPROVED` templates. Paused, disabled and pending-deletion templates are greyed out with the reason.
- **Edit:**
  - Allowed only for `APPROVED`, `REJECTED` or `PAUSED` templates.
  - The form keeps the name and language fixed. For approved templates the category is fixed too.
  - Saving sends the full set of components, since Meta replaces them all.
  - For an approved template, the form shows how many edits are left (1 per 24 h, 10 per 30 days) and warns that the edit goes back to review. Vartalap counts edits itself from its own log, because Meta's count isn't read back (**unverified** whether the API exposes it).
  - Rejected and paused templates can be edited without limit. This is the normal way to fix a rejection.
- **Delete:**
  - **Default:** delete one language version, by template ID (`hsm_id`).
  - **Whole template:** deleting every language version (by name) needs a second confirmation that lists those languages.
  - The confirmation explains three things:
    - messages already sent keep being delivered for up to 30 days;
    - an approved template's name can't be reused for 30 days;
    - past messages in chats are unaffected, since they store the rendered text (§4.2).
  - The template then shows "Deleting" until the sync no longer finds it, and the item is kept as `deleted` for history.
  - Disabled templates show no delete button, because Meta refuses that.
- **Who:** admins only (D2). Every create, edit and delete is written to the audit log (I6) with who, when and the template ID, never variable values from real sends.

### 4.2 Sending a template in a chat (agent)
- When the window is closed, the composer shows **"Window closed. Send a template"** instead of being disabled. The picker lists only `APPROVED` templates of the chat's number, in its language(s), with category labels and an estimated Meta cost (§4.6).
- The agent fills variables (pre-filled from sources) and sees the **exact** message the client will receive (§4.7) before pressing Send. Send stays disabled while any variable fails validation (§4.8).
- `POST /api/chats/:id/messages` accepts `{ template: { name, language, variables } }` as an alternative to `{ text }`. The window check is skipped for templates, but consent is checked (§4.4), the template must be `APPROVED` (re-checked from the `Templates` item), and the variables are validated again on the server (§4.8). A failure returns `400 VALIDATION` naming the variable, never its value.
- The message stores `type: 'template'`, `template { name, language, category }` and the **rendered text** (so the conversation history shows what the client saw). Variable values are part of the rendered text and are not stored separately.
- **Sender:** new `sendTemplate` in the WhatsApp client. Error codes for paused/disabled templates or missing payment method are final (no retry) and shown to the agent with a plain explanation.
- A client reply to the template reopens the 24 h window as usual.

### 4.3 Starting a new conversation (business-initiated)
- **New conversation** button (permission: admins, and agents if the workspace allows): enter a phone number (E.164 validation with country picker), choose number and template, confirm consent ("This person has agreed to receive messages from us", with the source of consent).
- Creates the chat (unassigned or assigned to the sender, D3) and sends the template.
- Respects F3: once created, the number is visible only per role rules.

### 4.4 Consent (opt-in / opt-out)
- New `Consents` items (PK `workspaceId#clientPhoneHash`, SK `category`): `status` (`opted_in` | `opted_out`), `source` (`inbound_message`, `web_form`, `import`, `agent_attested`, `keyword`, `button`), `at`, `by`, evidence note.
- **Rules (defaults):**
  - A client who messages the business has implicitly opted in to **service and utility** messages about their request (D1). Marketing needs explicit opt-in.
  - Inbound keywords (configurable; defaults `STOP`, `UNSUBSCRIBE`, Arabic `إيقاف`) or a template's "Stop promotions" button set `opted_out` for marketing, and send a confirmation.
  - A marketing send to an opted-out client is blocked in the API (`409 CONSENT_REQUIRED`); the UI hides marketing templates for them.
  - Admins can record opt-in from other channels (import CSV, or per chat), with a source note.
- Consent records are personal data: included in export and erasure (I7), but an opt-out is kept as a hashed suppression entry even after erasure, so the person isn't messaged again (D5).

### 4.5 Broadcasts (Phase 3)
- **Audience:** clients filtered by tag (F4), last-contact date, consent status; or a CSV upload (phone, variables). The audience is snapshotted at send time.
- **Pre-flight:** count, consent exclusions, estimated Meta cost (§4.6), and the portfolio messaging limit remaining. A broadcast larger than the limit is split across days or refused.
- **Per-recipient validation:** every recipient's values are checked with the same rules as a single send (§4.8) before the broadcast starts. Pre-flight lists the failing rows by row number and reason (e.g. "row 14: client_name is empty"). The admin fixes the CSV or explicitly excludes those rows; nobody is ever sent a half-filled message. A preview shows the message for the first recipient and for any chosen row.
- **Delivery:** a separate SQS queue and Lambda for broadcasts, rate-limited per number (well under 80 msg/s, e.g. 20/s) and per workspace, so live replies on the main queue are never delayed (I2 §4.4). Each recipient's message is appended to their chat (creating chats as needed) so replies land in context.
- **Safety:** a test send to the admin's own phone, a confirmation step with the count, a scheduled send time in the workspace timezone, and a stop button. Auto-stop if the template is paused or the failure rate exceeds a threshold.
- **Results:** sent/delivered/read/failed/replied per broadcast (feeds I11).

### 4.6 Cost visibility
- A `MetaRates` table refreshed from Meta's published rate cards (manual import per rate change in Phase 2; API if available, **unverified**) gives an estimate per category and country, shown before sending and in reports (I11).
- Estimates are labelled as estimates; Meta bills the customer directly (I3 D2).

### 4.7 Rendering and preview
- **One renderer:** `templates/render.js` turns a template plus variable values into both the payload sent to Meta and a preview model (header, body, footer and buttons). The editor preview, the send preview, the broadcast preview, and the rendered text stored on the message all come from this one function. That way the preview can't drift from what the client receives.
- **Looks like WhatsApp:** the preview is a WhatsApp-style bubble showing header, body, footer and buttons, with WhatsApp's bold, italic and strikethrough formatting applied. Values filled in from a source and values the agent typed are highlighted differently, so the agent can see where each value came from.
- **Only real values:** the preview shows exactly the values that will be sent. A variable with no valid value shows as a red "missing" chip, never `{{client_name}}`, an empty string or "undefined", and Send is disabled until it's fixed.

### 4.8 Variable validation ("Dear undefined" never reaches a client)
The same validator (`templates/validate.js`) runs in the browser for instant feedback, in the API before the message is stored, and in the broadcast pre-flight. The sender only sends payloads the API has already checked.
- **Resolve, then check:**
  - A source value that is missing, empty, or only whitespace counts as **missing**, never as text.
  - A missing value from an automatic source (e.g. a client with no WhatsApp profile name) **falls back to asking the agent**, with the variable's label ("Client name"). It is never sent empty.
  - Templates sent without an agent (broadcasts, I12 API) have no one to ask: a missing value means that recipient isn't sent.
- **Rejected values** (Vartalap rules unless a source is given):
  - empty, or only whitespace;
  - the literal strings `undefined`, `null`, `NaN`, `[object Object]`, in any letter case, as the whole value;
  - leftover template syntax: `{{` or `}}`;
  - line breaks or tabs, or more than 4 spaces in a row. This follows the provider-documented `132018` rule (unverified with Meta, §3).

  An agent-typed value is trimmed first. Vartalap never silently rewrites a value; it shows an error instead.
- **Length:**
  - a header variable must keep the rendered header within 60 characters;
  - body variables must keep the rendered body within 1,024 characters (Meta, §3);
  - a variable's own max length, if the admin set one, also applies.
- **URL button variables:** percent-encoded by the renderer, as Meta requires. The value must produce a valid URL.
- **Count:** the payload has exactly one value for each variable in the template. This prevents Meta error `132000` before sending.
- **Messages:** errors name the variable by its label, e.g. "Client name is required", and never repeat a value in logs (§9). The API's `400 VALIDATION` uses the existing error shape: `details.issues[].path = ['variables', '<name>']`.
- **If Meta still rejects:** a send-time `132000`, `132012`, `132018`, `131008` or `131009` marks the message failed, shows the agent which template failed with Meta's message, and is logged with the code only. These errors are final, so there's no retry.

## 5. Affected modules and files
- **Core:** `schemas/message.js` (`type: 'template'`, `template` object), new `schemas/template.js`, `schemas/consent.js`; new `templates/` (`sync`, `meta-rules` for create/edit checks, `render` §4.7, `validate` §4.8, `edit-quota`), `consents/`; `chats/window.js` (unchanged rule, but callers branch on templates); `messages/append.js` (template messages, preview text).
- **M5:** `webhook.js` (subscribe and handle `message_template_status_update`; `button` replies; opt-out keywords).
- **M6:** `whatsapp/client.js` (`sendTemplate`), `sender.js` (final error codes for template failures); new `broadcast-sender.js` (Phase 3).
- **M1:** `serverless.yml` (tables `Templates`, `Consents`, `Broadcasts`, `MetaRates`; broadcast queue and Lambda; template sync schedule).
- **M7:** routes `templates` (list, create, `PATCH` edit, `DELETE` one language or all, `POST …/refresh`, sync), `chats/[id]/messages` (template body), `chats` (`POST` new conversation), `consents`, `broadcasts`.
- **M8:** template picker in the composer with the send preview and per-variable errors, template editor with preview, edit-quota and delete-confirm dialogs, new-conversation dialog, consent panel in the chat (with F4), broadcasts pages.
- **Docs:** `PRD.md` (remove "Only the client can start a chat" and "Template messages are out of scope"; add consent rules).

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Does an inbound message count as opt-in? | **Yes for service/utility about that request; no for marketing.** Confirm with counsel per market (GDPR/PDPA/PDPL) |
| D2 | Who can send templates? | **Agents in their assigned chats; admins anywhere.** Broadcasts admins only |
| D3 | Who owns a business-initiated chat? | **The agent who started it** (assigned on creation) |
| D4 | Create templates in Vartalap or only sync from WhatsApp Manager? | **Both:** sync in Phase 1, create/edit in Phase 2 |
| D5 | Keep opt-outs after erasure? | **Yes, as a hashed suppression entry only**, to honour the opt-out; document in the privacy notice |
| D6 | Broadcasts in which plan? | **Business plan and above** (I5), with a monthly recipient cap per plan |
| D7 | Allow agents to start conversations at all? | **Workspace setting, off by default** |
| D8 | What does Delete remove by default? | **One language version (by ID).** Deleting all languages needs a second confirmation listing them |
| D9 | An automatic variable source is empty (e.g. no profile name). What happens? | **Ask the agent; never send empty or a generic word.** Admins may set a per-variable default ("there"), used only when they set it explicitly |
| D10 | Enforce the unverified whitespace rule (§4.8)? | **Yes.** It costs nothing and avoids `132018` failures; drop it if Meta confirms values may contain line breaks |
| D11 | Edit an approved template, or create a new version? | **Allow edits within Meta's quota**, and offer "Duplicate as new template" when the quota is used up or the category must change |

## 7. Risks
- **Policy violations by customers** (messaging people without opt-in) can get *their* number restricted and expose us as the Tech Provider. Mitigations: consent records, attestation at send time, opt-out handling built in, terms of service (I7).
- **Template quality pauses** stop sends mid-broadcast; handled by auto-stop and status sync.
- **Deleting by name** removes every language at once, and an approved template's name is then blocked for 30 days. Mitigated by deleting by ID by default and a second confirmation (D8).
- **Edits restart review:** an approved template goes back to Meta's review after an edit. Meta says it is re-approved unless it fails review. Whether it can still be sent during that review is **unverified**; test on `dev` before Phase 2 ships, and until then warn the admin.
- **Validation rules drift:** Meta's checks on variable values aren't fully documented (§3). Meta's error codes are still handled as final failures, and the validator's rules are listed in one module so they can be changed in one place.
- **Cost surprises:** marketing templates cost real money per recipient. Pre-flight estimates and confirmations reduce disputes; Meta bills the customer directly.
- **Rate changes:** Meta changes rates and rules several times a year; estimates must be dated and refreshed.
- **Broadcasts starve replies:** prevented by the separate queue and per-workspace limits.
- **Phone input** for new conversations brings full numbers into the agent UI, which F3 aimed to avoid. Restrict new-conversation to admins by default (D7) and never echo the number back after creation for agents.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Reopen chats | Template sync (API + status webhook) and per-template refresh; template picker in a closed-window chat; variable sources; shared renderer and send preview (§4.7); variable validation in browser and API (§4.8); `sendTemplate`; final error handling; implicit service opt-in and STOP keyword opt-out | M |
| 2. Manage and start | Template editor with Meta rule checks, preview and submit; edit with quota and re-review warning; delete by ID or all languages with confirmations; new conversation by phone number; consent panel, imports and attestation; cost estimates | M |
| 3. Broadcasts | Audiences (tags, filters, CSV), per-recipient validation and preview in pre-flight, pre-flight with limits and cost, broadcast queue and Lambda with rate limits, scheduling, test send, auto-stop, results | L |

## 9. Acceptance criteria
- [ ] In a chat whose window closed, an agent sends an approved utility template with the client's name filled in; the client receives it, the conversation shows the rendered text, and the client's reply reopens the composer.
- [ ] Sending a template that Meta paused fails immediately (no retries) with a clear message, and the template shows "Paused" in the picker within a minute of the webhook.
- [ ] A client who replies "STOP" is marked opted out of marketing; a marketing template to them is refused with `CONSENT_REQUIRED`; a utility template is still allowed.
- [ ] Templates created in WhatsApp Manager appear in Vartalap after a sync, with correct status.
- [ ] A broadcast of 500 recipients sends at the configured rate, never delays a live agent reply by more than 5 s, skips opted-out clients, and stops automatically if the template is paused.
- [ ] No template variable values are logged; consent records are included in a client data export (I7).
- [ ] **Create:** a template submitted from Vartalap appears in WhatsApp Manager as in review; Vartalap shows "In review" then "Approved" or "Rejected" (with Meta's reason) within a minute of the webhook. A body that starts or ends with a variable, or has a variable containing `$`, is refused by the form before it reaches Meta.
- [ ] **Edit:** an approved template can be edited once; a second edit within 24 h is blocked in the form with the time it becomes available. A rejected template can be edited repeatedly and resubmitted.
- [ ] **Delete:** deleting one language leaves the other languages in place. Deleting all languages needs the second confirmation. A disabled template offers no delete. Past messages using a deleted template still show their text in the chat.
- [ ] **Preview:** for a sample template with header, body, footer and a URL button, the preview text equals the text stored on the sent message and the text the test phone receives.
- [ ] **Validation:** in a chat whose client has no profile name, a template with `{{client_name}}` can't be sent until the agent types a name. The values `""`, `"   "`, `undefined`, `null`, `{{client_name}}`, and a value with a line break are each refused in the UI. The same values posted straight to the API get `400 VALIDATION` naming the variable, and nothing is sent to Meta.
- [ ] **Broadcast validation:** a CSV with 3 rows missing `client_name` shows those 3 rows in pre-flight; the broadcast can't start until they are fixed or explicitly excluded, and no recipient receives a message with an empty or placeholder value.
