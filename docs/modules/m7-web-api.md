# M7: Web API Routes (Next.js)

**Phase:** 3 · **Depends on:** M2, M3, M4 (+ M1 for real tables/queue) · **Unblocks:** M8 (real data), M9

## Goal
Implement the API contract from [M0](m0-foundation.md#api-implemented-in-m7-consumed-by-m8) as Next.js route handlers on top of `@vartalap/core`.

## Files
- `apps/web/proxy.js` (Next.js 16 renamed `middleware.js` to `proxy.js`; it runs on the Node.js runtime)
- `apps/web/next.config.mjs`, `app/layout.js`, `app/page.js` (placeholder until M8)
- `apps/web/lib/api.js`
- `apps/web/lib/queue.js`
- `apps/web/app/api/**/route.js` (routes listed in M0)

## Shared helpers (`lib/api.js`)
- `withHandler(fn)`: maps `AppError` codes to HTTP statuses using the M0 table; anything unknown becomes `INTERNAL` (logged, no message body).
- `requireUser(req)` / `requireAdmin(req)`: read and verify the session cookie, load the user, and reject inactive users. Also reject the session when `issuedAt < Date.parse(user.passwordChangedAt)`, so a password change logs out earlier sessions.
- `parseBody(req, zodSchema)`: returns `VALIDATION` with the field errors when the body doesn't match.

## Route notes
- **Login:** `verifyCredentials` → `signSession` → set the cookie. Use the same error for a wrong email and a wrong password.
- **`GET /api/chats`:** `listChatsForUser`, then add `assignee` (from a cached `listUsers`) and `windowOpen`.
- **`GET .../messages`:** `getChat` → `canView` or `FORBIDDEN`/`NOT_FOUND` → `readMessages`. `:phone` is URL-decoded and normalized to E.164.
- **`POST .../messages`:**
  1. `canSend`, then `isWindowOpen`; if the window is closed, return `WINDOW_EXPIRED`.
  2. `appendMessage({ direction: 'out', senderType: user.role, senderId, status: 'pending' })`.
  3. `lib/queue.js` sends `{ messageId, chatId }` to SQS (contract in M6).
  4. If the SQS send fails after the append: mark the message `failed` and return `INTERNAL`.
- **Assign / auto-assign:** pass straight through to M4.
- **`proxy.js`:** redirects to `/login` for pages without a valid session. API routes still check the session themselves; the middleware is only for UI convenience.

## Implementation notes (2026-10-17)
- **Next.js 16.4, App Router, JavaScript.** Every route exports `runtime = 'nodejs'` (AWS SDK, bcrypt). `[phone]` comes from `await context.params`; it is URL-decoded (safely) and passed through `normalizePhone`, and an invalid number gives `VALIDATION`.
- **Status codes:** `POST /api/users` and `POST .../messages` return `201`; other successes `200`, or `204` where M0 says so. Errors use the M0 table; `VALIDATION` responses carry `details.issues: [{ path, message }]`.
- **`INTERNAL`:** the body is always the generic `{ code: 'INTERNAL', message: 'Something went wrong' }`, also for an `AppError('INTERNAL')` thrown by core. The log has method, path (long digit runs masked to the last 4), error name and masked message, never request bodies.
- **Session cut-off:** JWT `iat` has whole-second precision, so `requireUser` rejects when `issuedAt < passwordChangedAt` floored to the second. Role and `active` come from the Users table, not the token.
- **`PUT /api/me/password`** re-issues the caller's session cookie, so the user who changed the password stays signed in while every older session is rejected.
- **`POST /api/auth/logout`** needs no session: it always clears the cookie.
- **Chat lookup:** `GET`/`POST .../messages` read the chat with a consistent `getChat`. A missing chat is `NOT_FOUND` for admins but `FORBIDDEN` for agents, so guessing phone numbers does not reveal which chats exist.
- **`GET .../messages`** returns `chat` as a `ChatSummary` (adds `assignee` and `windowOpen`), so M8 can show the window state without listing chats. Assign and auto-assign return the plain `Chat`.
- **`GET /api/chats`:** core's `listChatsForUser` already adds `assignee` (one `listUsers` call) and `windowOpen`; the route passes it through. `filter` defaults to `mine`.
- **SQS failure after append:** the message is marked `failed` with `errorCode: 'ENQUEUE_FAILED'` (best effort; a failure to mark is logged), then `INTERNAL` is returned.
- **`proxy.js`** only verifies the JWT (no Users table read). It skips `/api`, `/_next/*`, `/login` and any path with a dot. Unauthenticated page requests go to `/login`, with `?next=<path>` for paths other than `/`; M8 must only follow a relative `next`.

## Done when
- [ ] Every route in the M0 table returns the documented shape and error codes.
- [ ] An agent cannot read, send to, or assign a chat that isn't theirs (`403`), including by guessing the phone number in the URL.
- [ ] Sending outside the 24-hour window returns `409 WINDOW_EXPIRED` and writes nothing.
- [ ] A send creates a `pending` message and one SQS message.
