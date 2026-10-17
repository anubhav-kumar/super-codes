# M3: Core Users and Auth

**Phase:** 2 · **Depends on:** M0 · **Unblocks:** M4 (round-robin), M7

## Goal
Manage the `Users` table, password hashing, JWT sessions and seeding the first admin.

## Files
- `packages/core/src/users/repo.js`
- `apps/web/lib/session.js` (JWT and cookie helpers)
- `scripts/seed-admin.js`

## Exposes
```js
// packages/core (all re-exported from '@vartalap/core')
createUser({ email, name, role, password })   // → User (public view), active: true. Throws CONFLICT if the email exists, VALIDATION on bad input
getUserById(userId)                           // → User | null (never returns guard items)
getUserByEmail(email)                         // → { user, passwordHash } | null; internal, used for login only (Query on GSI byEmail)
verifyCredentials(email, password)            // → User | null; null for unknown email, wrong password or inactive user
changePassword(userId, currentPassword, newPassword)  // → void. UNAUTHENTICATED if the current password is wrong
                                              //   (or the user is unknown/inactive); VALIDATION if newPassword is too short
listUsers()                                   // → User[] (Scan, guard items excluded), sorted by name
listActiveAgents()                            // → [{ userId, name, lastAutoAssignedAt: string | null }]; used by M4
buildMarkAutoAssignedItem(userId, at, previousAt)
  // → TransactWriteItems entry { Update: { TableName, Key, UpdateExpression, ConditionExpression, ExpressionAttributeValues } }
  //   for a lib-dynamodb TransactWriteCommand. Sets lastAutoAssignedAt = at.
  //   Condition: previousAt === null → attribute_exists(userId) AND active = true AND attribute_not_exists(lastAutoAssignedAt);
  //              otherwise         → active = true AND lastAutoAssignedAt = :previousAt.
  //   (The active check means an agent deactivated mid-selection is never picked.)
  //   M4 puts this in its auto-assign transaction next to the chat update.

// apps/web/lib/session.js
SESSION_COOKIE                        // cookie name: 'vartalap_session'
SESSION_TTL_SECONDS                   // 8 h
signSession(user)                     // → Promise<JWT string> { sub: userId, role }, 8 h expiry, HS256 (jose), key from SSM JWT_SECRET
verifySession(token)                  // → Promise<{ userId, role, issuedAt /* ms */ } | null>; never throws on a bad, expired or foreign token
sessionCookieOptions()                // → { httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 h }
buildSetCookie(token)                 // → Set-Cookie header string for the session
buildClearCookie()                    // → Set-Cookie header string that clears it (Max-Age=0)
```
The cookie helpers are framework-light (header strings plus an options object usable with Next.js `cookies().set(SESSION_COOKIE, token, sessionCookieOptions())`), because Next.js arrives in M7.

## Rules
- Emails are lowercased and trimmed before storing.
- Uniqueness: `createUser` puts the user and a guard item `{ userId: 'EMAIL#<email>' }` in one transaction, with `attribute_not_exists` on both.
- bcrypt cost 10 (`bcryptjs`). Minimum password length 8.
- `passwordHash` never leaves the repo layer (`toPublicUser` validates every returned user with `UserSchema`); the only exception is `getUserByEmail`, which is internal to login.
- Guard items (`{ userId: 'EMAIL#<email>', ownerUserId }`) have no `email` attribute, so they never appear in `byEmail`; reads and scans also skip them by prefix.
- `verifyCredentials` runs a dummy bcrypt compare for unknown emails to limit timing differences.
- **Signing key (updated 2026-10-17):** read from the SSM parameter `/vartalap/<STAGE>/JWT_SECRET` (override the name with `JWT_SECRET_PARAM`), never from env files. It's cached for 5 minutes. It must be at least 32 characters. `signSession` / `verifySession` throw if it is missing, too short or still `CHANGE_ME`, because that's a deployment error, not a bad token.
- Admins can create admins and agents. Any user can change their own password.
- `seed-admin.js` reads `SEED_ADMIN_EMAIL` (optional `SEED_ADMIN_NAME`, default `Admin`). If no user with that email exists, it creates the admin with a **generated password and prints it once**, and the admin changes it after first sign-in. Otherwise it exits 0 without changes. No password is read from env files.
- `npm run seed` runs `node --env-file-if-exists=../.env --env-file-if-exists=../apps/web/.env.local seed-admin.js`, so env comes from the shell, the root `.env` or `apps/web/.env.local` (shell values win). It needs AWS credentials plus `AWS_REGION`, `STAGE` and the table/queue vars that `getConfig()` requires.

## Done when
- [ ] The seed script creates the first admin, and running it again changes nothing.
- [ ] Creating a user with an existing email (in any letter case) fails with `CONFLICT`.
- [ ] `verifyCredentials` fails for a wrong password and for an inactive user.
- [ ] A JWT signed with a different secret, or expired, is rejected by `verifySession`.

## Security hardening (2026-10-17)
- **bcrypt 72-byte limit:** passwords longer than 72 UTF-8 bytes are rejected (`PASSWORD_MAX_BYTES`), in both `createUser`/`changePassword` and the API schema. bcrypt silently ignores bytes past 72.
- **Session cut-off on password change:** `changePassword` sets `passwordChangedAt`. The public `User` includes `passwordChangedAt` (ISO or `null`). `verifySession` returns `issuedAt` (ms). M7's `requireUser` must reject a session when `issuedAt < Date.parse(user.passwordChangedAt)`.
