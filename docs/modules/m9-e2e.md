# M9: End-to-End Integration

**Phase:** 4 · **Depends on:** all modules + Meta app credentials

## Goal
Prove the full round trip on the `dev` stage with a real WhatsApp test number, and record the setup so the client business can repeat it on their own cloud.

## Steps
1. Put the Meta credentials in SSM `/vartalap/dev/*`, then `serverless deploy --stage dev`.
2. Register the webhook URL and verify token in the Meta app, and subscribe to `messages`.
3. Copy the deploy outputs into `apps/web/.env.local`, run `npm run seed`, then `npm run dev`.
4. Walk through the scenarios below.
5. Write `docs/runbook.md`: setup, environment variables, deploy/remove, how to inspect and redrive the DLQ, and how to rotate the WhatsApp token.

## Scenarios
| # | Scenario | Expected |
|---|---|---|
| 1 | The test phone messages the business number | The chat appears under Unassigned for the admin within about 5 s |
| 2 | The admin auto-assigns the chat to agent A | Agent A sees the chat; agent B does not |
| 3 | Agent A replies | The message reaches the phone; status goes pending → sent → delivered → read |
| 4 | The admin replies in A's chat | The phone receives it with no label; A sees it labeled "sent by admin" |
| 5 | The admin reassigns the chat to B | B sees the full history; A loses access immediately |
| 6 | The client and the agent send at the same moment | Both messages are in the chat, in order, with none missing |
| 7 | Meta resends a webhook | No duplicate message |
| 8 | No client message for more than 24 h | The composer is disabled; the API returns `WINDOW_EXPIRED` |
| 9 | The WhatsApp token is broken temporarily | The send ends up `failed` after 3 attempts, and the payload is in the DLQ |

## Done when
- [ ] All scenarios pass on `dev`.
- [ ] `docs/runbook.md` exists, and someone new can follow it.
- [ ] The README Status column is updated for all modules.
