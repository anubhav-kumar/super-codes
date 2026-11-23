# CA CRM backend

Deployment is described in the repository root `README.md`. This file covers backend-only operator tasks.

## Create a staff account

There is no sign-up screen. The operator creates each staff account after the `auth` service is deployed:

```bash
cd backend
npm install
assume CoderAnubhav95 --exec "node scripts/create-user.js --stage prod --email a@firm.in --name 'Asha Rao'"
```

- The script asks for the password twice with echo off (8-200 characters). It is never accepted as an argument.
- It fails if the email already exists. Add `--overwrite` to reset that account's name and password (the user id is kept; existing sessions stay valid until they expire). `--overwrite` keeps the account's role and Worker link and clears any temporary password.
- New accounts are **admins**. Add `--member` to create a member (or, with `--overwrite`, to turn an existing account into a member). There is no flag to promote; use the Users screen.
- `--worker-id <uuid>` links the account to an existing, active Worker (at most one account per Worker, one Worker per account). It is refused if the Worker is missing, inactive or already linked to another account. With `--overwrite` it replaces the current link.
- Accounts created before roles existed have no role attribute and are treated as admins; no migration is needed.
- It writes to the DynamoDB tables `ca-crm-auth-<stage>-users` and `ca-crm-auth-<stage>-worker-links` (one transaction), reads `ca-crm-workers-<stage>-workers`, and only runs under the `CoderAnubhav95` profile.

Sessions last 30 days from sign-in. Signing out deletes the session.

## Order timeline (P-27)

- New service `timeline` (stack `ca-crm-timeline-<stage>`, routes under `/timeline`) owns the table `ca-crm-timeline-<stage>-entries` (comments and events of an order; LSI `byTime` for time order, created with the table; Retain, PITR).
- `PUT /orders/{id}` writes a `STATUS_CHANGED` timeline entry in the same transaction when the status changes, so the `orders` service needs the `timeline` stack. **Deploy all services together** (the default `node deploy.js`). If `orders` is deployed without `timeline`, every order edit that changes the status fails until `timeline` exists.
- Existing orders start with an empty timeline (no back-fill).
