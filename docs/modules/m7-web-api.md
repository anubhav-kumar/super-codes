# M7: Web API Routes (Next.js)

**Phase:** 3 · **Depends on:** M2, M3, M4 (+ M1 for real tables/queue) · **Unblocks:** M8 (real data), M9

## Goal
Implement the API contract from [M0](m0-foundation.md#api-implemented-in-m7-consumed-by-m8) as Next.js route handlers on top of `@vartalap/core`.

## Files
- `apps/web/middleware.js`
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
- **`middleware.js`:** redirects to `/login` for pages without a valid session. API routes still check the session themselves; the middleware is only for UI convenience.

## Done when
- [ ] Every route in the M0 table returns the documented shape and error codes.
- [ ] An agent cannot read, send to, or assign a chat that isn't theirs (`403`), including by guessing the phone number in the URL.
- [ ] Sending outside the 24-hour window returns `409 WINDOW_EXPIRED` and writes nothing.
- [ ] A send creates a `pending` message and one SQS message.
