# M5: Webhook Lambda (Inbound)

**Phase:** 3 · **Depends on:** M1, M2, M4 · **Needs:** Meta app credentials · **Unblocks:** M9

## Goal
Receive WhatsApp Cloud API callbacks: verify them, store inbound client messages and apply delivery status updates.

## Files
`services/whatsapp/src/handlers/webhook.js`, `src/whatsapp/signature.js`, `src/whatsapp/parse.js`

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

## Done when
- [ ] Meta's webhook verification succeeds against the deployed URL.
- [ ] A text message from a test number creates an `UNASSIGNED` chat and a message linked to the head.
- [ ] Replaying the same webhook payload creates no duplicate.
- [ ] A request with a bad signature gets `401` and writes nothing.
- [ ] Status callbacks move an outbound message through `sent → delivered → read`.
