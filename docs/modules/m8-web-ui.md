# M8: Web UI (Next.js)

**Phase:** 3 · **Depends on:** M0 contracts, M7 (real API only; no mock mode, decided 2026-10-17) · **Unblocks:** M9

## Goal
A basic, functional UI for agents and admins. Plain and usable, not polished.

## Files
- `apps/web/app/login/page.js`
- `apps/web/app/chats/page.js`, `apps/web/app/chats/[phone]/page.js`
- `apps/web/app/admin/users/page.js`
- `apps/web/app/account/password/page.js`
- `apps/web/lib/client-api.js`: fetch wrapper around the M7 API (same-origin `/api/...`, JSON, maps `{ error: { code } }` responses). There is no mock mode: local development runs against the deployed `dev` stack.

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
