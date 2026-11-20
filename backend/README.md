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
- It fails if the email already exists. Add `--overwrite` to reset that account's name and password (the user id is kept; existing sessions stay valid until they expire).
- It writes to the DynamoDB table `ca-crm-auth-<stage>-users` and only runs under the `CoderAnubhav95` profile.

Sessions last 30 days from sign-in. Signing out deletes the session.
