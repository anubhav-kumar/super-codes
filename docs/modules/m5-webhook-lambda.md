# M5: Webhook Lambda (Inbound)

**Phase:** 3 · **Depends on:** M1, M2, M4 · **Needs:** Meta app credentials · **Unblocks:** M9

## Goal
Receive WhatsApp Cloud API callbacks: verify them, store inbound client messages and apply delivery status updates.

## Files
`services/whatsapp/src/handlers/webhook.js`, `src/whatsapp/signature.js`, `src/whatsapp/parse.js`

## Settings
Read the WhatsApp values with `getParams(['WA_PHONE_NUMBER_ID', 'WA_APP_SECRET', 'WA_VERIFY_TOKEN'])` from `src/lib/params.js`. They are SSM parameters created by the stack; the env vars only hold their names (`WA_*_PARAM`). Values are cached for 5 minutes, and an unset (`CHANGE_ME`) value throws a clear error.

## Behavior
- **`GET /webhook`:** if `hub.mode === 'subscribe'` and `hub.verify_token === WA_VERIFY_TOKEN`, return `hub.challenge` as text with `200`. Otherwise return `403`.
- **`POST /webhook`:**
  1. Verify `X-Hub-Signature-256` = HMAC-SHA256(raw body, `WA_APP_SECRET`), using a timing-safe comparison. If it doesn't match, return `401`.
  2. `parse.js` turns `entry[].changes[].value` into two lists: `messages` and `statuses`. Ignore events for a different `phone_number_id`.
  3. **For each inbound message:**
     - `type === 'text'`: `appendMessage` with:
       - `messageId = wamid`, `direction: 'in'`, `senderType: 'client'`, `isClientMessage: true`;
       - `chatId` = sender `wa_id` normalized to E.164;
       - `clientName` from `contacts[].profile.name`.
     - Other types (image, audio, etc.): store a placeholder text message, `"[unsupported: <type>]"`, so the agent knows something arrived. Supporting them properly is out of scope for v1.
  4. **For each status:** `getMessageByWaId(id)`, then `updateStatus`. Unknown IDs are logged (ID only) and skipped.
  5. Return `200` once the batch is processed. A failure on one item is logged and the others still go through. Meta retries non-`200` responses, and duplicates are already safe.

## Logging
Log event counts, wamids and the last 4 digits of phone numbers. Never log message text or full numbers.

## Implementation notes
- **Event:** API Gateway HTTP API, payload v2. The signature is computed over the raw body bytes (base64-decoded first when `isBase64Encoded`). A missing, non-`sha256=` or wrong-length header returns `401` without throwing.
- **Settings errors:** if `getParams` fails (env var missing, parameter unset), both `GET` and `POST` return `500`, so Meta retries once it is fixed. A correctly signed body that is not JSON returns `400`. Other methods return `405`.
- **`hub.verify_token`** is compared timing-safe as well.
- **Inbound message fields:** `status: 'delivered'` (the schema requires an enum value; inbound messages have no delivery lifecycle, and `read` would wrongly suggest an agent has read it). `waMessageId` is also set to the wamid, so the item carries its WhatsApp ID like outbound ones. Status callbacks never target inbound messages; even if one did, `updateStatus` is a no-op because inbound items have no `statusRank`.
- **Text** is cut to `MESSAGE_TEXT_MAX` (4096) so a long body can't fail validation. `clientName` is matched from `contacts[]` by `wa_id === from`; when there is no match it is left unchanged on the chat.
- **Skipped items** (logged, not stored): a sender that doesn't normalize to E.164 (logged with its last 4 digits), a message without an `id`, and a status outside `sent | delivered | read | failed` (e.g. `deleted`).
- **Order:** messages are processed one at a time in payload order, then statuses.
- **Logs** are JSON lines (`level`, `msg`, fields). Errors log only `name`, `code` and `message`, not `AppError.details`.
- **IAM:** the existing webhook role already covers every call: `GetItem` on chats; `PutItem` on messages and `UpdateItem` on chats (the transaction); `Query` on `byWaMessageId`; `UpdateItem` on messages.

## Done when
- [ ] Meta's webhook verification succeeds against the deployed URL.
- [ ] A text message from a test number creates an `UNASSIGNED` chat and a message linked to the head.
- [ ] Replaying the same webhook payload creates no duplicate.
- [ ] A request with a bad signature gets `401` and writes nothing.
- [ ] Status callbacks move an outbound message through `sent → delivered → read`.

## Known limitations (v1)
- Only `changes[].field === "messages"` is processed, and only for the configured `phone_number_id`.
- Only `type: "text"` is stored as text. Images, audio, video, documents, stickers, locations, contacts, **button/list replies** (`button`, `interactive`) and **reactions** are stored as `[unsupported: <type>]`.
- **WhatsApp Business app (coexistence):** messages staff send from the phone app arrive as `smb_message_echoes` and are ignored, so Vartalap doesn't show them.
- Statuses for messages Vartalap didn't send (e.g. templates from another system) are logged as `status_unknown_message` and skipped.
- Meta's dashboard **Test** webhook uses a fake `phone_number_id`, so it's skipped as `other_phone_number_id` (still 200).

