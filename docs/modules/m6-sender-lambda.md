# M6: Sender Lambda (Outbound)

**Phase:** 3 · **Depends on:** M1, M2 · **Needs:** Meta app credentials · **Unblocks:** M9

## Goal
Read the outbound SQS FIFO queue and deliver each message through the WhatsApp Cloud API.

## Files
`services/whatsapp/src/handlers/sender.js`, `src/whatsapp/client.js`

## Queue message contract (written by M7)
```json
{ "messageId": "<ulid>", "publicId": "c_…" }
```
`MessageGroupId = publicId`, `MessageDeduplicationId = messageId`. F3: the payload is phone-free, so the queue and the DLQ never hold a client's number. The recipient comes from the stored message (`message.chatId`). A legacy `{ messageId, chatId }` body still validates (both extra fields are optional) for jobs in flight during the rollout.

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

## Implementation notes
- `to` is sent as digits only (the leading `+` of the E.164 `chatId` is stripped), matching the `wa_id` format Meta uses.
- The request times out after 10 s (`AbortSignal.timeout`), well inside the 30 s Lambda timeout.
- `client.js` throws `WhatsAppSendError { retryable, status, code }`. `code` is Meta's `error.code` as a string, or `TIMEOUT` / `NETWORK` / `HTTP_<status>` when Meta gave none.
- Retryable: network errors, timeouts, 5xx, 429, and these Meta codes whatever the HTTP status (Meta often returns them as 400): `2`, `4`, `80007`, `130429`, `131000`, `131016`, `131056`, `133004` ([error codes](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes)). Every other 4xx is final.
- A 2xx response with no `messages[0].id` is treated as final (`BAD_RESPONSE`), because a retry could send the message twice.
- A malformed queue body (bad JSON or failed `OutboundQueueMessageSchema` check) is logged and dropped.
- Unexpected errors during the send (for example, SSM settings still `CHANGE_ME`) are retried like retryable errors. On the final attempt they are marked `failed` with `errorCode: 'INTERNAL'`.
- If `setWaMessageId` throws after WhatsApp accepted the message, the error is logged (`sender.record_failed`, including the `waMessageId`) and the record resolves **without** a retry. Retrying would send the message twice. The message stays `pending` until someone reconciles it.
- Logs are one JSON line per event: `messageId`, `publicId` (F3), the last 4 digits of the phone (from the stored message), the receive count, the HTTP status and the error code. They never include the message text, the full number or the token.

## Open issues
- **Duplicate send after a crash.** If the Lambda dies or times out between a successful Cloud API call and `setWaMessageId`, the message is still `pending` on redelivery and is sent again. Fixing this needs a "sending" claim before the call, which in turn needs a status-model change in M2. It is not done in v1.

## Done when
- [ ] A queued message reaches the test phone, and its status becomes `sent` with a `waMessageId`.
- [ ] Simulated 5xx responses produce 3 attempts, then `failed`, and the payload ends up in the DLQ.
- [ ] A permanent 4xx marks the message `failed` immediately, with no retries.
- [ ] Redelivering an already-sent queue message does not send it twice.

## F2 changes (media messages, 2026-10-17)
- A message with `media` goes through `src/whatsapp/send-media.js`: wait (≤ 15 s) for the GuardDuty tag `NO_THREATS_FOUND` on `out/<messageId>` (else retry; `THREATS_FOUND` → final `MALWARE`), read the file, re-check size and magic bytes, `POST /{phone-number-id}/media`, cache `media.waMediaId` (so a retry doesn't upload again), then send `{ type, <type>: { id, caption, filename } }`. Audio has no caption.
- `client.js`: `sendMedia`, shared `postMessage` / `graphError`; 131053 (media format) is final.
- Timeout 90 s, 512 MB, queue visibility 540 s.
