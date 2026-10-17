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
// packages/core
createUser({ email, name, role, password })   // → User (public view). Throws CONFLICT if the email exists
getUserById(userId)                           // → User | null
getUserByEmail(email)                         // → { user, passwordHash } | null; internal, used for login only
verifyCredentials(email, password)            // → User | null; rejects inactive users
changePassword(userId, currentPassword, newPassword)
listUsers()                                   // → User[]
listActiveAgents()                            // → [{ userId, name, lastAutoAssignedAt }]; used by M4
markAutoAssigned(userId, at)                  // used by M4 inside its transaction (or exposed as a transaction item builder)

// apps/web/lib/session.js
signSession(user)                     // → JWT string { sub, role }, 8 h expiry, signed with JWT_SECRET (HS256, jose)
verifySession(token)                  // → { userId, role } | null
setSessionCookie(res, token) / clearSessionCookie(res)   // httpOnly, Secure in prod, SameSite=Lax
```

## Rules
- Emails are lowercased and trimmed before storing.
- Uniqueness: `createUser` puts the user and a guard item `{ userId: 'EMAIL#<email>' }` in one transaction, with `attribute_not_exists` on both.
- bcrypt cost 10 (`bcryptjs`). Minimum password length 8.
- `passwordHash` never leaves the repo layer.
- Admins can create admins and agents. Any user can change their own password.
- `seed-admin.js` reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, creates the admin if none exists with that email, and exits without changes otherwise.

## Done when
- [ ] The seed script creates the first admin, and running it again changes nothing.
- [ ] Creating a user with an existing email (in any letter case) fails with `CONFLICT`.
- [ ] `verifyCredentials` fails for a wrong password and for an inactive user.
- [ ] A JWT signed with a different secret, or expired, is rejected by `verifySession`.
