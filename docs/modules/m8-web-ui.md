# M8: Web UI (Next.js)

**Phase:** 3 · **Depends on:** M0 contracts, M7 (real API only; no mock mode, decided 2026-10-17) · **Unblocks:** M9

## Goal
A basic, functional UI for agents and admins. Plain and usable, not polished.

## Files
All signed-in pages sit in the `app/(staff)/` route group. The group doesn't change URLs; its layout loads the current user once and renders the top bar.
- `apps/web/app/login/page.js`: `/login`
- `apps/web/app/(staff)/layout.js`: `UserProvider` + `AppShell`
- `apps/web/app/(staff)/chats/layout.js`: two panes (list + conversation); one pane at a time on phones
- `apps/web/app/(staff)/chats/page.js`, `apps/web/app/(staff)/chats/[phone]/page.js`: `/chats`, `/chats/:phone`
- `apps/web/app/(staff)/admin/users/page.js`: `/admin/users`
- `apps/web/app/(staff)/account/password/page.js`: `/account/password`
- `apps/web/app/page.js`: `/` redirects to `/chats`
- `apps/web/app/globals.css`: plain CSS with light/dark tokens
- `apps/web/components/`: `UserContext`, `AppShell`, `ChatList`, `Conversation`, `AssignControl`, `Composer`
- `apps/web/lib/client-api.js`: fetch wrapper around the M7 API (same-origin `/api/...`, JSON, maps `{ error: { code } }` responses). There is no mock mode: local development runs against the deployed `dev` stack.
- `apps/web/lib/use-polling.js`, `lib/format.js`, `lib/constants.js`

## Screens
| Screen | Who | Contents |
|---|---|---|
| Login | public | Email, password, error message |
| Chat list | all | Agent: their chats. Admin: tabs for Unassigned / All, plus each chat's assignee. Shows the preview, the time and a "window expired" marker. Polls every 5 s. |
| Conversation | assignee, admin | History (newest at the bottom, "load older" via `nextBefore`), a status tick on outbound messages, a "sent by admin" label on admin messages (visible to staff only). Polls every 3 s and refetches only when `headMessageId` changes. |
| Composer | assignee, admin | Text input. Disabled with a "window expired" note when `windowOpen` is false. Shows `failed` messages in red. |
| Assign panel | admin | An agent dropdown plus an "Auto-assign" button, in the conversation header and on unassigned rows. |
| Users | admin | List; create an admin or agent (email, name, role, initial password). |
| Change password | all | Current password plus a new password. |

## Notes
- Pause polling when the browser tab is hidden (`visibilitychange`).
- Optimistic send: show the message as `pending` right away, then replace it with the server response.
- No component library is required; plain CSS modules are fine.

## Done when
- [ ] Every screen works end to end against the real M7 API on the `dev` stack.
- [ ] An agent never sees admin-only controls.
- [ ] A new inbound message appears within about 3 s while the conversation is open.

## Implementation notes
- **Polling:** the conversation re-reads the latest page (30 messages) every 3 s. That keeps statuses fresh too. It doesn't poll only on a head change, because there is no cheaper endpoint. Older pages are loaded on demand with `?before=<oldest shown>` and merged without duplicates. If more than 30 messages arrive while older pages are open, there can be a gap until the chat is reopened.
- **Optimistic send:** the message shows as "Sending…" until the API answers. On an error it shows "Not sent" with Retry and Discard. `WINDOW_EXPIRED` and `FORBIDDEN` also refresh the chat.
- **401 handling:** any 401 from the API redirects to `/login?next=<current path>`, except login and password change, where 401 means wrong credentials. `safeNext` only follows same-site relative paths, so `?next=` can't be an open redirect.
- **Access lost:** if a chat is reassigned away from an agent, the next poll gets 403 and the conversation shows "not assigned to you any more".
- **Sender labels:** outbound messages are labelled "You", or "Admin"/"Agent". Admins also see the sender's name, from `GET /api/users`. Admin messages use a different bubble colour. Clients never see either label.
- **No core imports in the browser:** client components don't import `@vartalap/core`, because its entry point pulls in the AWS SDK and bcrypt. `lib/constants.js` mirrors the few constants needed. The build check confirms no SDK code in the client bundles.
- **Not in v1:** deactivating users (no API exists), and unassigning a chat.

