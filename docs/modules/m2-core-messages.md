# M2: Core Messages (Linked List)

**Phase:** 2 · **Depends on:** M0 · **Unblocks:** M5, M6, M7

**Highest correctness risk in the project.** Every other module relies on this.

## Goal
Append messages to a chat's linked list safely under concurrency, read history backwards from the head, and apply status updates.

## Files
`packages/core/src/messages/append.js`, `read.js`, `status.js`

## Exposes
```js
appendMessage({ chatId, message, chat })
// message: { messageId?, direction, senderType, senderId, type, text, status, waMessageId? }
//   messageId: given for inbound (= wamid); generated as a ULID when omitted (outbound)
// chat: { clientName?, isClientMessage }   // isClientMessage → set lastClientMessageAt
// → { message, duplicate: false } | { message: null, duplicate: true }

readMessages({ chatId, before, limit = 30 })
// → { headMessageId, messages /* newest first */, nextBefore /* messageId | null */ }

getMessage(messageId)
getMessageByWaId(waMessageId)          // byWaMessageId index
setWaMessageId(messageId, waMessageId) // also moves status to 'sent' if forward; → { applied }
updateStatus({ messageId, status, errorCode? }) // forward-only; returns { applied: boolean }
```

## Append algorithm
1. Read the chat item (consistent read) to get the current `headMessageId`. It may not exist.
2. `TransactWriteItems`:
   - **Put** the message with `prevMessageId = head`, condition `attribute_not_exists(messageId)`.
   - **Update** the chat:
     - set `headMessageId`, `lastMessageAt` and `lastMessagePreview` (first 80 characters);
     - if `isClientMessage`, also set `lastClientMessageAt` and `clientName`;
     - if the chat is new, also set `assignedTo = if_not_exists(assignedTo, 'UNASSIGNED')`.
     - Condition: `headMessageId = :head`, or `attribute_not_exists(chatId)` when there was no chat.
3. On `TransactionCanceledException`, inspect the cancellation reasons:
   - The message put failed → **duplicate**; return `{ duplicate: true }`.
   - The chat condition failed → the head moved; go back to step 1. Retry up to 5 times with jitter, then throw `INTERNAL`.

The chat update in step 2 writes to the `Chats` table. That is intentional: the head must move in the same transaction as the put. M4 owns every other chat field.

## Read algorithm
- Start at `before`'s `prevMessageId`, or at the chat's `headMessageId` if `before` is not given.
- Follow `prevMessageId` with `GetItem` until `limit` messages have been read or the pointer is `null`.
- `nextBefore` = the last message read, or `null` at the start of the chat.
- Sequential reads are acceptable for v1. Caching or a `seq` number for BatchGet comes later.

## Status rules
- Forward-only, using a conditional update on a stored `statusRank`: `pending` 0, `sent` 1, `delivered` 2, `read` 3.
- `failed` is allowed only when the current status is `pending` or `sent`.
- A late or out-of-order callback is a no-op (`applied: false`), not an error.

## Implementation notes
- `waMessageId` is the `byWaMessageId` GSI key, so it is **omitted** from the item until known (a stored `NULL` would be rejected by the index). Reads map a missing value to `null`, so the contract still shows `waMessageId: null`.
- `statusRank` is stored only for outbound messages with a ranked status. Setting `failed` removes `statusRank`, which makes `failed` terminal: every later rank comparison fails.
- A chat that exists without a head (created before its first message) is conditioned on `attribute_exists(chatId) AND (attribute_not_exists(headMessageId) OR attribute_type(headMessageId, 'NULL'))`.
- `assignedTo = if_not_exists(assignedTo, 'UNASSIGNED')` is set on every append; it is a no-op for existing chats.
- The message is validated with `MessageSchema` before any write (`VALIDATION` on failure). A `TransactionConflict` cancellation is retried like a moved head. "Up to 5 times" means 5 retries after the first attempt.
- `setWaMessageId` on a message already at or past `sent` (or `failed`) still records `waMessageId` but leaves the status; it returns `{ applied: false }`. An unknown `messageId` throws `NOT_FOUND`.
- `readMessages` throws `NOT_FOUND` if `before` is not a message of `chatId`, and stops walking on a missing, foreign or repeated item instead of looping. Base-table reads are strongly consistent so a just-appended head is always visible.

## Done when
- [ ] Two appends to the same chat fired at the same time both land, and walking from the head returns both, in order, with no message dropped.
- [ ] Appending the same `wamid` twice returns `duplicate: true` and leaves exactly one item.
- [ ] Paging through a 100-message chat with `limit=30` returns 30/30/30/10, then `nextBefore = null`.
- [ ] `delivered` after `read` is ignored; `failed` after `delivered` is ignored.
