# Deploying to AWS

Run every command from the `algotrading/` folder.

## Placeholders

- `<profile>`: your **personal** AWS CLI profile (`aws configure list-profiles`).
  - Do not deploy to a company account.
  - Check which profile your shell uses by default (`AWS_PROFILE`), and always pass `AWS_PROFILE=<profile>` explicitly.
- `<email>`: your personal email address. It is used for:
  - the SES sender and recipient
  - the SNS alert subscription

The region is fixed in `serverless.yml` (`ap-south-1`), so the shell's `AWS_REGION` does not matter.

## 1. Confirm the AWS account

```bash
AWS_PROFILE=<profile> aws sts get-caller-identity
```

Make sure the account ID shown is your personal account.

## 2. Verify your email in SES (one time)

```bash
AWS_PROFILE=<profile> aws sesv2 create-email-identity --email-identity <email> --region ap-south-1
```

Click the verification link AWS emails you.

New SES accounts start in the "sandbox", which only allows sending to verified addresses. That is enough here, because the bot sends only to `<email>`.

## 3. Log in to Serverless Framework (one time)

```bash
npx serverless login
```

Serverless v4 needs a (free for personal use) Serverless account.

Always use `npx serverless`. The project pins v4 in `package.json`, while a global install may be an older version.

## 4. Deploy

```bash
AWS_PROFILE=<profile> NOTIFY_EMAIL=<email> npx serverless deploy
```

- **What it builds:**
  - the Linux arm64 dependency layer, with no Docker needed
  - every AWS resource: Lambdas, DynamoDB tables, SQS queue + DLQ, S3 bucket, schedules, SNS topic, CloudWatch alarms
- **After it finishes:** **confirm the SNS subscription email** AWS sends to `<email>`. Failure alerts won't arrive until you do.

## 5. Smoke test

```bash
# Creates the paper account with INR 5,000 on first use, then adds INR 100
AWS_PROFILE=<profile> NOTIFY_EMAIL=<email> npx serverless invoke -f deposit --data '{"amount": 100}'

# Run the end-of-day job now. On a trading day after 15:30 IST this sends the EOD email.
AWS_PROFILE=<profile> NOTIFY_EMAIL=<email> npx serverless invoke -f quant

# Logs
AWS_PROFILE=<profile> NOTIFY_EMAIL=<email> npx serverless logs -f quant
```

## Daily operation

After deployment, these jobs run automatically Monday–Friday (IST):

| Time | Job |
|---|---|
| 09:00 | Executor — SELL run |
| 09:30 | Executor — BUY run |
| 18:30 | Quant — settle fills, check drift, create orders, EOD email |

## Redeploy

Repeat step 4 after any change to the code or to `config/portfolio.json`.

## Tear down

1. Empty the reports bucket (`algotrading-dev-reports-<account-id>`).
2. Then run:

```bash
AWS_PROFILE=<profile> NOTIFY_EMAIL=<email> npx serverless remove
```
