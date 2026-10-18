# I8: Real-Time Updates and Notifications

Status: Research · 2026-10-17 · Builds on: M2, M5, M7, M8 · Related: F1 (unread counts), I1 (hosting), I2 (workspaces), I10 (status, assignment rules)

## 1. Goal
Agents must notice a new message within seconds, even when the Vartalap tab is in the background or closed. Today the UI polls every 3–5 s, which feels slow, costs DynamoDB reads per open tab whether or not anything changed, and stops entirely when the browser is closed. I8 replaces polling with pushed updates and adds notifications (in-browser, desktop/mobile push and email digests), so no client waits because nobody saw their message.

**Who it's for:** agents and admins. **Out of scope:** native mobile apps (D5), and notifications to the WhatsApp client (that is F5 templates).

## 2. Current state
- **Polling:** the chat list polls `GET /api/chats` every ~5 s; an open conversation polls `GET /api/chats/:id/messages` every ~3 s and refetches only when `headMessageId` changes (`docs/arch/boilerplate.md` §5.4; `apps/web/components/Conversation.js`, `ChatList.js`). The PRD lists WebSockets as a later step (`docs/PRD.md` §UI updates, §Deferred).
- **Cost shape:** each poll re-reads the caller's chat list (Query on `byAssignee`, or a full Scan for the admin "All" tab, `packages/core/src/chats/repo.js`). With 20 agents and 1 admin each holding one tab, that's roughly 4–5 list reads per second all day, plus one Scan every 5 s per admin; the Scan grows with the number of chats.
- **No notifications of any kind:** no unread counts (F1 Phase 4 deferred), no sound, no browser notification, no email.
- **Web app hosting:** localhost (I1). Any push channel must work with the production host chosen in I1.

## 3. Research findings
- **API Gateway WebSocket APIs:** managed connections that Lambda can push to through `PostToConnection`. Limits: a connection lasts at most **2 hours** and closes after **10 minutes idle**, neither adjustable, so clients must reconnect and send keep-alives. New connections are limited to 500 per second per account per Region ([API Gateway WebSocket quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html)). The app must store connection IDs (e.g. in DynamoDB) and fan out itself.
- **AWS AppSync Events:** a managed pub/sub WebSocket service (launched 2024-10-30 in all AppSync regions; publishing over WebSocket added 2025-03-13) with channels and namespaces; servers publish over HTTP and browsers subscribe, with no connection table to manage ([AppSync Events](https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-welcome.html)). Supports Lambda authorizers and IAM for publishing.
- **Server-Sent Events (SSE):** simple, one-way, works over HTTP. It needs a long-lived server connection, which suits a container host but not request-billed Lambda hosting (I1).
- **Web Push:** the Push API with a service worker delivers notifications even when no tab is open ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)). VAPID keys identify the sender ([RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292)). Safari on iOS/iPadOS supports Web Push only for web apps added to the Home Screen (16.4+) ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- **Change source:** DynamoDB Streams deliver every write on Messages and Chats to a Lambda, which is the single place to publish events without touching the webhook, sender and API write paths ([DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)).
- **Email:** Amazon SES for transactional email; production access requires leaving the SES sandbox ([SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)).

## 4. Proposed design

### 4.1 Architecture (recommended: AppSync Events + DynamoDB Streams)
```
Messages/Chats writes ──► DynamoDB Streams ──► publisher Lambda ──► AppSync Events channels
                                                    │                      │
                                                    └─► Web Push / email   └─► browser (subscribed)
```
- **Why AppSync Events:** no connection table, no fan-out code, and it works the same whichever host I1 picks. API Gateway WebSockets is the fallback (D1).
- **Channels** (namespace `vartalap`), always scoped by workspace (I2):
  - `/ws/<workspaceId>/user/<userId>`: everything a user must know (chat assigned to them, new message in their chat, mention).
  - `/ws/<workspaceId>/admins`: new unassigned chats and changes visible to all admins.
- **No message content on the wire:** events carry `{ type, chatId: publicId, headMessageId, at }` only. The browser then fetches the data through the normal API with all access checks. This keeps access control in one place (`canView`) and avoids leaking text or numbers through a second channel (F3).
- **Subscribe authorisation:** a Lambda authorizer validates a short-lived subscribe token issued by `GET /api/realtime/token` (signed, 5 min, contains `workspaceId`, `userId`, `role`) and allows only the caller's own user channel, plus `admins` for admins.
- **Event types:** `message.new`, `message.status`, `chat.assigned`, `chat.unassigned`, `chat.status` (I10), `note.mention` (F4/I10).
- **Fallback:** the client keeps polling at a slow rate (30 s) and on reconnect, so a dropped socket never means missed messages. Polling at 3 s is removed.

### 4.2 Client behaviour
- One subscription per tab via a shared `RealtimeProvider`; `BroadcastChannel` between tabs to avoid duplicate notifications.
- On `message.new` for the open chat: fetch new messages from the known head. For other chats: update the list row and unread count (I10 §4.2).
- Reconnect with backoff; after reconnect, refetch the list once.

### 4.3 Notifications
| Channel | When | Default |
|---|---|---|
| In-app (badge, bold row, title count `(3) Vartalap`) | Unread inbound in a chat the user can see | On |
| Sound | New inbound in an assigned chat, tab in background | On, user can mute |
| Browser/desktop notification (Notification API, tab open) | New inbound in an assigned chat; new assignment | On after permission |
| Web Push (no tab open) | Same as above, plus new unassigned chat for admins | Opt-in per device |
| Email digest | Unread assigned chats older than N minutes while the user is offline | Opt-in, N = 15 |
| Admin alert | Unassigned chat waiting > N minutes; chat without reply > SLA (I10) | On for admins, N = 10 |

- **Notification content:** title "New message", body = chat display name (F3 `displayName`) only. **Never the message text** by default (lock screens and shared screens). A workspace setting can allow a short preview (D3).
- **Preferences:** per user (`Users.notificationPrefs`) with quiet hours.
- **Web Push storage:** `PushSubscriptions` (PK `userId`, SK endpoint hash) with the subscription JSON; deleted on `410 Gone`, logout from that device, or user deactivation.
- **Email:** SES from a verified domain per stage, with SPF/DKIM/DMARC set up (I1); unsubscribe link per notification type.

### 4.4 Cost and limits
- Polling removal cuts steady-state DynamoDB reads to near zero when nothing happens.
- AppSync Events is billed per million operations and connection-minutes ([AppSync pricing](https://aws.amazon.com/appsync/pricing/)); at 50 agents online 10 h a day that is small compared with today's polling reads. **Unverified:** exact per-unit prices; check the pricing page before quoting customers.

## 5. Affected modules and files
- **M1:** `serverless.yml` (Streams on Messages and Chats; publisher Lambda; AppSync Events API and authorizer; `PushSubscriptions` table; SES identity; VAPID keys in SSM as secrets per I6).
- **Core:** new `packages/core/src/realtime/` (event shapes, channel names), `notifications/` (preferences, routing).
- **New service code:** `services/whatsapp/src/handlers/publish-events.js`, `realtime-authorizer.js`, `notify-digest.js` (scheduled).
- **M7:** `app/api/realtime/token/route.js`, `app/api/me/notifications/route.js`, `app/api/me/push-subscriptions/route.js`.
- **M8:** `RealtimeProvider`, service worker `public/sw.js`, notification settings page, unread badges; remove 3 s/5 s polling from `Conversation.js` and `ChatList.js`.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Push transport? | **AppSync Events.** API Gateway WebSockets if a customer's dedicated stack can't use AppSync; SSE only if I1 chooses a container host |
| D2 | Message text in real-time events? | **No.** IDs only, then fetch via the API |
| D3 | Message preview in notifications? | **Off by default**, workspace setting to allow up to 40 characters |
| D4 | Email digests on by default? | **No, opt-in**, since agents may not want work email after hours |
| D5 | Native mobile app? | **No.** A PWA with Web Push covers Android and desktop; iOS needs Home Screen install. Revisit when a customer requires it |

## 7. Risks
- **Missed events** on reconnect or a publisher failure: mitigated by the 30 s safety poll and refetch on reconnect; Streams retry failed batches.
- **Authorisation drift:** a reassigned agent might keep receiving events on an old channel. Events carry IDs only and the API re-checks access, so no data leaks; the user channel is per user, not per chat, so nothing needs revoking.
- **Notification fatigue:** too many alerts get disabled. Defaults focus on assigned chats only.
- **iOS limits:** Web Push only after Home Screen install; document it in onboarding.
- **Streams ordering:** ordered per item, not across items. The client always refetches from the API, so ordering of events doesn't affect correctness.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Push updates | Streams → publisher → AppSync Events; subscribe token and authorizer; client provider; remove fast polling (keep 30 s safety poll); unread badges and title count | M |
| 2. In-browser alerts | Sound and Notification API; per-user preferences and quiet hours | S |
| 3. Off-tab | Service worker and Web Push; `PushSubscriptions`; admin alerts for waiting chats | M |
| 4. Email | SES domain set-up; digest scheduler; unsubscribe | S |

## 9. Acceptance criteria
- [ ] With the conversation open, an inbound WhatsApp message appears in under 2 s (p95) on `dev`, with no 3 s polling in the network tab.
- [ ] Killing the socket (devtools offline for 60 s) and restoring it shows every message sent meanwhile without a reload.
- [ ] An agent subscribing to another user's channel or another workspace's channel is rejected by the authorizer.
- [ ] No real-time event payload or notification body contains message text (unless the workspace enabled previews) or any phone digits.
- [ ] With all Vartalap tabs closed and Web Push enabled, a new assigned message produces a system notification on desktop Chrome and on Android.
- [ ] DynamoDB read units for an idle workspace with 10 agents online drop by at least 90 % compared with polling.
