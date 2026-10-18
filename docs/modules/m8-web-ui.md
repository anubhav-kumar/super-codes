# M8: Web UI (Next.js)

**Phase:** 3 · **Depends on:** M0 contracts, M7 (real API only; no mock mode, decided 2026-10-17) · **Unblocks:** M9

## Goal
A basic, functional UI for agents and admins. Plain and usable, not polished.

## Files
All signed-in pages sit in the `app/(staff)/` route group. The group doesn't change URLs; its layout loads the current user once and renders the top bar.
- `apps/web/app/login/page.js`: `/login`
- `apps/web/app/(staff)/layout.js`: `UserProvider` + `AppShell`
- `apps/web/app/(staff)/chats/layout.js`: two panes (list + conversation); one pane at a time on phones
- `apps/web/app/(staff)/chats/page.js`, `apps/web/app/(staff)/chats/[id]/page.js`: `/chats`, `/chats/:id` (F3: `:id` is the chat's opaque `publicId`)
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

## F3 changes (hide the client's phone, 2026-10-17)
- Chat objects in the browser carry `id` (the `publicId`), `displayName`, and `phone` for admins only; never `chatId`. Links are `/chats/${chat.id}`; `client-api.js` `chatPath(id)`; `Conversation` takes an `id` prop.
- `chatTitle(chat)` returns `chat.displayName` (server-computed: the profile name, or `Client #XXXX`). The conversation header and the details panel show `chat.phone` only when present (admins).
- Chat-list search matches `displayName`, the preview, and (admins) `phone`.
- `/chats/<anything that is not a publicId>` (e.g. an old `/chats/+65…` bookmark) shows "That is not a valid chat address." without calling the API, and is never redirected (D8).
- After rollout, ask staff to clear Vartalap entries from their browser history: old `/chats/%2B…` URLs cannot be purged remotely.

## F4 changes (client attributes, 2026-10-17)
- `DetailsPanel` renders `ClientPanel` (description editor with version conflict handling, `TagInput` chips + datalist autocomplete, `NotesTimeline`). Description and tags come with the 3 s conversation poll; notes load when the panel opens and re-poll every 15 s while it is open.
- `ChatList`: up to 3 tag chips per row then `+n`, and a tag filter (`?tag=` in the URL) combined with the tabs. Autocomplete uses tags from loaded chats (`lib/known-tags.js`) plus the catalog.
- `/admin/tags` (admin): catalog and the "catalog only" switch. Note and description editors warn (never block) on card-, passport- or ID-like numbers (`lib/sensitive.js`).
- Limits mirrored in `lib/constants.js`; browser code still never imports `@vartalap/core`.

## F2 changes (media messages, 2026-10-17)
- `components/MessageBody.js` renders the bubble per type: image/sticker (`<img>`, lazy, opens full size), audio (`<audio controls>`, "Voice note" label), video (`<video controls preload="metadata">`), document card with Download, location with an "Open in map" link (no embedded map), contacts (name + number count), reaction badge, and pending / unavailable / too-large states. Media that is still being scanned is retried every 5 s, up to 6 times.
- `Composer.js`: paperclip attach button, file type and size checked before upload, preview chip with remove, caption (max 1024; none for audio). `Conversation.js`: optimistic bubble with upload progress (XHR) and Retry/Discard.
- `lib/constants.js` mirrors the outbound limits and MIME allowlist; `lib/client-api.js` adds `createUpload`, `sendMedia`, `mediaUrl` and `uploadFile`.
