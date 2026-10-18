# I6: Account Security, Roles and Audit Log

Status: Research · 2026-10-17 · Builds on: M3, M7 · Depends on: I2 (memberships, operator role) · Related: I1 (WAF, headers), I7 (compliance), I9 (logging)

## 1. Goal
Business customers will ask security questions before paying: "Do you support MFA? SSO? Can we see who did what? What happens when an employee leaves?" A shared inbox holds their clients' personal data, so a single compromised agent password exposes every chat that agent can see. I6 brings authentication and account management up to what a B2B buyer and their InfoSec questionnaire expect: brute-force protection, password reset, MFA, SSO, user lifecycle (deactivate, role change, sign out everywhere), finer roles, encrypted secrets, and an audit log that customers can read.

**Who it's for:** every user (safer accounts), workspace admins (control and visibility), you (fewer incidents, answers for security reviews). **Out of scope:** certification itself (ISO 27001/SOC 2, see I7 D-items).

## 2. Current state
- **Login:** `POST /api/auth/login` checks email and bcrypt hash and returns one generic error for unknown email, wrong password or inactive user (`apps/web/app/api/auth/login/route.js`; `packages/core/src/users/repo.js:153-163`). A dummy-hash comparison equalises timing for unknown emails (`repo.js:19-24`). Good basics.
- **No brute-force protection:** no per-account or per-IP throttling, lockout or CAPTCHA anywhere on login.
- **Passwords:** minimum 8 characters, maximum 72 bytes (bcrypt limit) (`packages/core/src/schemas/user.js:4-6`); bcrypt cost 10 (`repo.js:15`). No breached-password check.
- **No password reset:** there is no self-service reset and no admin-initiated reset. The deployment guide's recovery for a lost admin password is deleting DynamoDB items by hand (`docs/deployment.md` troubleshooting).
- **Sessions:** HS256 JWT, 8 h, `httpOnly`, `SameSite=Lax`, `Secure` in production (`apps/web/lib/session.js`). Revocation only by password change (`passwordChangedAt` check, `apps/web/lib/api.js:64-81`) or by rotating `JWT_SECRET` (signs everyone out). No "sign out other sessions", no idle timeout.
- **No MFA, no SSO.**
- **User lifecycle:** `GET/POST /api/users` only (`apps/web/app/api/users/route.js`). The repo has no function to deactivate a user or change a role (`users/repo.js`), although `active` exists and is enforced on login and every request.
- **Roles:** `admin`, `agent` (`schemas/user.js:3`). Admins can create other admins. No read-only, supervisor or billing role.
- **Secrets:** all secrets (Meta token, app secret, verify token, JWT key) are SSM `String`, protected by IAM only, not KMS-encrypted (`services/whatsapp/README.md:35`, `docs/deployment.md` §3 notes).
- **No audit log** of logins, user changes, assignments, exports or settings changes.

## 3. Research findings
- **NIST SP 800-63B-4** ([pages.nist.gov/800-63-4/sp800-63b.html](https://pages.nist.gov/800-63-4/sp800-63b.html); final around August 2025, publication date not re-confirmed):
  - Passwords used as a single factor must be at least **15** characters; with MFA, at least **8**. Allow at least 64 characters.
  - No composition rules and no periodic forced changes; screen new passwords against a blocklist of common/breached passwords.
  - Limit consecutive failed attempts to **100 or fewer** per account (rate limiting, not necessarily lockout).
  - AAL2 must offer a phishing-resistant option such as WebAuthn; syncable passkeys are acceptable at AAL2.
- **OWASP Authentication Cheat Sheet:** throttle by account and by IP, generic error messages, MFA, secure reset flows with single-use, short-lived tokens ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)). **OWASP Session Management:** idle and absolute timeouts, rotation on privilege change, server-side revocation ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)).
- **TOTP** ([RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238)) works with any authenticator app; **WebAuthn/passkeys** ([W3C WebAuthn](https://www.w3.org/TR/webauthn-2/), [passkeys.dev](https://passkeys.dev)) are phishing-resistant.
- **Breached-password check:** the Have I Been Pwned range API uses k-anonymity (only the first 5 hex characters of the SHA-1 hash are sent) ([HIBP API](https://haveibeenpwned.com/API/v3#PwnedPasswords)).
- **Secrets in AWS:** CloudFormation can't create SSM `SecureString` parameters (`AWS::SSM::Parameter` accepts `String`/`StringList` only); create them outside CloudFormation or use **Secrets Manager**, which supports rotation as often as every 4 h ([SSM parameter resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ssm-parameter.html), [Secrets Manager rotation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_schedule.html)).
- **SSO:** OpenID Connect with Google Workspace and Microsoft Entra ID covers most SMB buyers; SAML is asked for by enterprises. A managed broker (Amazon Cognito user pools with OIDC/SAML federation, or a vendor such as WorkOS) avoids implementing SAML ourselves ([Cognito federation](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation.html)).

## 4. Proposed design

### 4.1 Brute-force protection
- **Per account:** a `LoginAttempts` item (PK `email#<normalized>`, TTL 1 h) with a failure counter. After 5 failures, require a delay that doubles per failure (max 15 min); after 20 in 24 h, require a password reset or admin unlock and email the user. Well under NIST's 100.
- **Per IP:** WAF rate-based rule on `/api/auth/*` (I1) plus an app-level counter (e.g. 30 attempts / 10 min / IP).
- Same generic error for every failure, as today. A locked account says "Too many attempts, try again in N minutes" only after a correct-format request, without revealing whether the email exists.

### 4.2 Passwords and reset
- Minimum **12** characters (D1), max 72 bytes kept; no composition rules; HIBP k-anonymity check on set/change (fail open if the API is down).
- bcrypt cost raised to 12 (re-hash on next login).
- **Forgot password:** email a single-use token (32 random bytes, stored hashed, 30 min TTL). Using it sets a new password, sets `passwordChangedAt` (ending all sessions) and notifies the user.
- **Admin reset:** admins can send a reset email to a member; they never see or set the password.
- The seed script stays for the very first admin of a dedicated stack only.

### 4.3 Multi-factor authentication
- **TOTP** enrolment (QR code + 10 one-time recovery codes, stored hashed). Secret stored encrypted (KMS, §4.6).
- **Passkeys (WebAuthn)** as a second factor or a passwordless method (Phase 3).
- **Workspace policy:** "Require MFA for all members" (admins can enforce; on by default for the Business plan, D2). Mandatory for operator accounts (I2 §4.5).
- Login becomes two steps: password → short-lived "MFA pending" token → TOTP/passkey → session.

### 4.4 Sessions
- Keep the stateless JWT for speed, add a `sessionId` (`sid`) claim and a `Sessions` table (PK `userId`, SK `sid`, `createdAt`, `lastSeenAt`, user agent family, IP prefix, TTL = absolute expiry).
- `requireUser` checks the session item (cached ~30 s per process), enabling:
  - **Sign out other sessions** and **sign out this device** for users;
  - **Admins revoke a member's sessions** (on deactivation, automatically);
  - Idle timeout (default 2 h without activity) and absolute timeout (default 12 h, D3).
- Re-issue the session (new `sid`) on login, MFA completion, role change and workspace switch (I2).
- "Active sessions" list in account settings.

### 4.5 User lifecycle and roles
- Routes: `PATCH /api/users/:id` (name, role, active), `POST /api/users/:id/reset-password`, `DELETE /api/users/:id/sessions`. Invitations replace admin-set passwords (I2 §4.6).
- **Deactivate** a member: immediate effect (active check exists), revoke sessions, unassign or reassign their open chats (admin chooses; default: back to Unassigned), stop counting the seat (I5).
- An admin can't deactivate or demote themselves if they are the last admin.
- **Roles** (per membership, I2):
  | Role | Can |
  |---|---|
  | Owner | Everything, including billing and deleting the workspace; at least one per workspace |
  | Admin | Users, settings, all chats, templates, broadcasts |
  | Supervisor | All chats (read and reply), assign, reports; no users, billing or settings |
  | Agent | Assigned chats only (as today) |
  | Viewer (optional) | Read-only reports and chats, for managers/compliance |
  `access.js` grows from a role check to a permission check (`can(role, 'chats.viewAll')`) so roles can be added without touching every route.

### 4.6 Secrets
- Move the Meta tokens (per number, I3), app secret, verify token, JWT signing key, Stripe keys (I5) and VAPID keys (I8) to **Secrets Manager** (or SSM `SecureString` created by a deploy script outside CloudFormation), encrypted with a customer-managed KMS key per stage.
- Lambdas and the web task role get `secretsmanager:GetSecretValue` on their own secrets only, and `kms:Decrypt` via the key policy.
- JWT key rotation: support two active keys (`kid` header) so rotation doesn't sign everyone out.
- Secret scanning in CI (I1 §4.5).

### 4.7 Audit log
- `AuditLog` table (PK `workspaceId`, SK `ts#eventId`; GSI by actor). Append-only from the app's point of view (no update/delete IAM for the web role; retention by TTL, 1 year default, I9 D4).
- **Events:** login success/failure (no password), MFA changes, password reset, session revocations, user invite/role change/deactivation, chat assignment and reassignment, template create/delete, broadcast sent, data export, erasure requests (I7), settings changes, billing plan changes, operator support access (I2 §4.5), API key create/revoke (I12).
- Each entry: actor (userId, role, or `operator`/`system`), action, target IDs (opaque: `publicId`, userId), IP prefix, user agent family, `requestId` (I9). Never message text, notes or phone numbers.
- **UI:** Settings → Audit log for admins/owners, filter by actor, action and date; CSV export on Business+ (I5).

### 4.8 SSO (Phase 3)
- OIDC with Google and Microsoft first (most SMB customers), SAML for Dedicated/enterprise.
- **Domain verification** (DNS TXT) before a workspace can enforce SSO for an email domain.
- JIT provisioning as Agent (default) when a verified-domain user signs in for the first time, if the admin enables it; SCIM later.
- With SSO enforced, password login is disabled for that workspace's members (except a break-glass owner).

## 5. Affected modules and files
- **Core:** `users/repo.js` (update, deactivate, reset tokens, bcrypt cost, HIBP), `schemas/user.js` (`PASSWORD_MIN_LENGTH`, MFA fields), new `auth/` (throttling, MFA, sessions, reset), `access.js` (permissions), new `audit/`.
- **M7:** `apps/web/lib/session.js` (`sid`, `kid`, two keys), `lib/api.js` (`requireUser` checks session item and permissions), `app/api/auth/*` (login steps, forgot/reset, MFA, SSO callbacks), `app/api/users/[id]/*`, `app/api/me/sessions`, `app/api/audit`.
- **M8:** login with MFA step, forgot/reset pages, account security page (MFA, passkeys, sessions), user management (role, deactivate, reset), audit log page.
- **M1:** `serverless.yml` (tables `LoginAttempts`, `Sessions`, `AuditLog`, `Credentials`; KMS key; Secrets Manager secrets and IAM; remove `String` secret parameters after migration).
- **Docs:** `docs/deployment.md` §3 (secrets), `services/whatsapp/README.md`, a customer-facing security overview page (for questionnaires).

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Minimum password length? | **12**, with breached-password screening; MFA strongly encouraged. NIST asks 15 for password-only accounts; 12 + enforced MFA on Business is a reasonable middle |
| D2 | Enforce MFA by default? | **Required for owners, admins and operators; workspace setting for everyone else**, default on for Business |
| D3 | Session timeouts? | **Idle 2 h, absolute 12 h** (one shift); workspace-configurable within limits |
| D4 | Build SSO or use a broker? | **Broker** (Cognito federation or a vendor) for SAML; OIDC Google/Microsoft can be direct |
| D5 | Audit log retention? | **1 year**, exportable; longer on Dedicated |
| D6 | Secrets Manager or SecureString? | **Secrets Manager** for per-number Meta tokens (many, rotated, created at runtime by I3); SecureString acceptable for static app-level secrets |

## 7. Risks
- **Account recovery abuse:** reset by email is only as strong as the user's mailbox; MFA mitigates. Admin-initiated resets are audited.
- **Locking out legitimate users** by throttling: progressive delays instead of hard lockout, plus admin unlock.
- **Session table on the hot path** adds a read per request; cache briefly and keep the item small.
- **Permission refactor** touches every route's checks; do it once with I2's context change, and re-run access tests (I2 isolation suite).
- **Secrets migration** can break sends if done out of order: deploy code that reads both locations first, migrate, then remove the old parameters.
- **SSO misconfiguration** can let any Google user from a domain in; domain verification and default role Agent limit the blast radius.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Must-have before the first paying customer | Login throttling (account + IP); password reset by email; admin reset; 12-char minimum + breached check; deactivate/role change with session revocation and chat reassignment; secrets to Secrets Manager/KMS; audit log for auth and user events | M |
| 2. MFA and sessions | TOTP with recovery codes; MFA policy per workspace; `Sessions` table with idle/absolute timeouts and "sign out everywhere"; JWT key rotation with `kid` | M |
| 3. Enterprise | Roles (owner, supervisor, viewer) and permission checks; audit log UI and export; SSO (OIDC, then SAML via broker) with domain verification; passkeys | L |

## 9. Acceptance criteria
- [ ] 50 wrong passwords for one account from varied IPs are throttled with growing delays; 20 failures within 24 h force a reset and email the user. Unknown emails get the same responses and timing.
- [ ] "Forgot password" sends a single-use link that expires in 30 minutes; using it ends all other sessions.
- [ ] A user with TOTP enabled can't sign in with the password alone; a recovery code works once.
- [ ] Deactivating an agent signs them out within 30 s on every device, returns their open chats to Unassigned (or to the chosen agent), and reduces the billed seats.
- [ ] No Meta token, app secret, JWT key or Stripe key is stored as a plain `String` parameter in any `prod` stack.
- [ ] The audit log shows who assigned a chat, who changed a role and every login, and contains no message text or phone numbers.
- [ ] The last owner of a workspace can't remove or demote themselves.
