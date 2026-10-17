# M6: Sender Lambda (Outbound)

**Phase:** 3 · **Depends on:** M1, M2 · **Needs:** Meta app credentials · **Unblocks:** M9

## Goal
Read the outbound SQS FIFO queue and deliver each message through the WhatsApp Cloud API.

## Files
`services/whatsapp/src/handlers/sender.js`, `src/whatsapp/client.js`

## Queue message contract (written by M7)
```json
{ "messageId": "<ulid>", "chatId": "<E.164 phone>" }
```
`MessageGroupId = chatId`, `MessageDeduplicationId = messageId`.

## Settings
Read the WhatsApp values with `getParams(['WA_PHONE_NUMBER_ID', 'WA_ACCESS_TOKEN'])` from `src/lib/params.js`. They are SSM parameters created by the stack; the env vars only hold their names (`WA_*_PARAM`). Values are cached for 5 minutes, and an unset (`CHANGE_ME`) value throws a clear error.

## Behavior
1. `getMessage(messageId)`. If it is missing, or its status is already beyond `pending`, log it and return successfully. This makes retries safe.
2. `client.js` sends `POST https://graph.facebook.com/<version>/<WA_PHONE_NUMBER_ID>/messages` with `{ messaging_product: 'whatsapp', to: chatId, type: 'text', text: { body } }` and the bearer `WA_ACCESS_TOKEN`. The Graph API version is a config value.
3. On success: `setWaMessageId(messageId, response.messages[0].id)`, which moves the status to `sent`.
4. On failure:
   - **Retryable** (network error, 5xx, 429): throw, so SQS retries.
   - **Not retryable** (4xx, e.g. an invalid number or the 24-hour window expired, code 131047): `updateStatus(failed)` and return successfully. Store the error code on the message as `errorCode`.
   - On the **final** retryable attempt (`ApproximateReceiveCount >= 3`): mark the message `failed` before throwing, so the UI shows it while the payload goes to the DLQ.

## Done when
- [ ] A queued message reaches the test phone, and its status becomes `sent` with a `waMessageId`.
- [ ] Simulated 5xx responses produce 3 attempts, then `failed`, and the payload ends up in the DLQ.
- [ ] A permanent 4xx marks the message `failed` immediately, with no retries.
- [ ] Redelivering an already-sent queue message does not send it twice.
