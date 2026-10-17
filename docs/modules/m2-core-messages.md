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
setWaMessageId(messageId, waMessageId) // also moves status to 'sent'
updateStatus({ messageId, status })    // forward-only; returns { applied: boolean }
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

## Done when
- [ ] Two appends to the same chat fired at the same time both land, and walking from the head returns both, in order, with no message dropped.
- [ ] Appending the same `wamid` twice returns `duplicate: true` and leaves exactly one item.
- [ ] Paging through a 100-message chat with `limit=30` returns 30/30/30/10, then `nextBefore = null`.
- [ ] `delivered` after `read` is ignored; `failed` after `delivered` is ignored.
