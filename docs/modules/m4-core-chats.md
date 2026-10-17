# M4: Core Chats, Access Rules and Assignment

**Phase:** 2 · **Depends on:** M0 (uses M3's `listActiveAgents` / `markAutoAssigned` interfaces) · **Unblocks:** M5, M7

## Goal
Read and list chats, decide who can see or send in a chat, assign chats manually or by round-robin, and check the 24-hour window.

## Files
`packages/core/src/chats/repo.js`, `assign.js`, `window.js`, `packages/core/src/access.js`

## Exposes
```js
getChat(chatId)                               // → Chat | null
listChatsForUser(user, filter)                // filter: 'mine' | 'unassigned' | 'all'
                                              //   agent: only 'mine' allowed (else FORBIDDEN)
                                              //   'mine' / 'unassigned' → query byAssignee; 'all' → Scan (admin only)
                                              // → ChatSummary[] sorted by lastMessageAt desc

assignChat({ chatId, userId, by })            // admin only; target must be an active user; → Chat
autoAssign({ chatId, by })                    // admin only; → Chat

canView(user, chat)                           // admin → true; agent → chat.assignedTo === user.userId
canSend(user, chat)                           // same as canView, for v1
isWindowOpen(chat, now = Date.now())          // now - lastClientMessageAt < 24 h
```

## Rules
- **Reassignment** just overwrites `assignedTo`. The new agent sees the full history; the old agent fails `canView` straight away.
- **Round-robin:** `autoAssign` calls `listActiveAgents()` and picks the agent with the oldest `lastAutoAssignedAt` (never-assigned agents first, tie broken by `userId`). It then runs one transaction:
  - update the chat's `assignedTo`;
  - update that agent's `lastAutoAssignedAt` (condition: the value is unchanged, so two clicks at once don't pick the same "next" agent; retry once on conflict).
  If there are no active agents, it throws `CONFLICT`.
- The "sent by admin" label is just `senderType = 'admin'` on the message; there is nothing to store in the chat.
- No assignment history in v1 (decided 2026-10-17). It can be added later as audit items written in the same transaction.

## Done when
- [ ] An agent listing `unassigned` or `all` gets `FORBIDDEN`; an admin gets the right sets.
- [ ] After reassignment from agent A to agent B, `canView(A)` is false and `canView(B)` is true.
- [ ] Three auto-assigns with agents A, B and C give A, B, C (then A again).
- [ ] `isWindowOpen` is false 24 h + 1 s after the last client message, and true again after a new client message.
