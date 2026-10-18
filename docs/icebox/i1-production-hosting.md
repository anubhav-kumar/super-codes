# I1: Production Hosting, Environments and CI/CD

Status: Research · 2026-10-17 · Builds on: M1, M7, M8 · Unblocks: every other I1–I12 feature in production · Related: I6 (secrets), I9 (alarms, runbook)

## 1. Goal
Nobody pays for software that runs on the developer's laptop. Today the Next.js app (UI and API) runs on `localhost` with the developer's assumed AWS credentials. I1 puts it on a public HTTPS domain with its own least-privilege IAM role, separates `dev`, `staging` and `prod`, and makes every release a reviewed, repeatable, reversible pipeline run instead of a manual `serverless deploy`.

**Who it's for:** the operator (you) first, and every paying workspace, which needs an always-on URL. **Out of scope:** multi-tenancy (I2), custom domains per customer (I2 D-item), and data residency choices (I7).

## 2. Current state
- **Web app:** `npm run dev` on `localhost:3000`, using the developer's `assume` credentials. "Hosting the web app itself is out of scope for v1" (`docs/deployment.md` §What gets deployed; `docs/PRD.md` §Deferred "Production deployment of the Next.js app").
- **Framework:** Next.js `^16.4.2`, React 19 (`apps/web/package.json:20-22`). `next.config.mjs` sets `transpilePackages: ['@vartalap/core']`, `outputFileTracingRoot` at the monorepo root and a `Referrer-Policy` header. No `output: 'standalone'`.
- **Config:** the web app needs only `AWS_REGION` and `STAGE`; table names and the queue URL come from SSM `/vartalap/<stage>/config/*` at startup (`apps/web/instrumentation.js`, `docs/deployment.md` §4). The session key comes from SSM `JWT_SECRET` (`apps/web/lib/session.js:19-52`).
- **Cookies:** `secure` only when `NODE_ENV === 'production'` (`apps/web/lib/session.js:84`), so a production build behind HTTPS is required.
- **AWS side:** one Serverless Framework v4 stack per stage (`services/whatsapp/serverless.yml`), deployed by hand. v4 needs a Serverless login or license key (`docs/arch/boilerplate.md` §9.1).
- **Stages:** only `dev` exists. Region default `ap-south-1`.
- **IAM for the web app:** a sample policy for the developer's role (`services/whatsapp/README.md` §IAM for the local Next.js app). No role exists in the stack.
- **No CI/CD**, no branch protection, no release tags, no rollback procedure.
- **Edge security:** no WAF, no rate limiting (see I6 for login throttling), no custom domain, no CDN.

## 3. Research findings
- **AWS Amplify Hosting:** supports SSR for Next.js **12–15**, including the App Router. Not supported: Edge API routes and edge middleware, on-demand ISR, streaming, and `after` ([Amplify SSR support](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html), checked 2026-10-17). **Next.js 16 support is not documented by AWS** (only third-party claims), so Amplify is a risk for this repo.
- **OpenNext (AWS adapter):** packages a Next.js build for Lambda/CloudFront. It "aims to support all Next.js 15 features" and is maintained by the SST community ([opennext.js.org/aws](https://opennext.js.org/aws)). Next.js 16 support is not stated on that page (**unverified**).
- **Container hosting:** Next.js's `output: 'standalone'` produces a self-contained Node server ([Next.js output docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)). It runs on any container platform (ECS Fargate behind an Application Load Balancer, or similar) with no adapter, so it supports whatever the Next.js version supports. Long-lived processes also suit server-side caches (SSM config, JWT secret) and SSE (I8 D1).
- **Edge protection:** AWS WAF managed rule groups (core rule set, known bad inputs, IP reputation) and rate-based rules attach to an ALB or CloudFront ([AWS WAF managed rules](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html), [rate-based rules](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based.html)).
- **CI to AWS without long-lived keys:** GitHub Actions can assume an IAM role through OIDC ([GitHub: Configuring OpenID Connect in AWS](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)).
- **Serverless Framework v4 in CI:** needs `SERVERLESS_ACCESS_KEY`; a paid license applies to organisations above USD 2M annual revenue (`docs/arch/boilerplate.md` §9.1, from Serverless docs). If Vartalap becomes a business above that threshold, this is a recurring cost (D6).

## 4. Proposed design

### 4.1 Hosting option compared
| Option | Fit for Next.js 16 | Ops effort | Cost at small scale | Verdict |
|---|---|---|---|---|
| (a) **ECS Fargate + ALB, `output: 'standalone'` container** | Full (no adapter) | Medium: image build, task definition, autoscaling | ~2 small tasks always on (USD tens per month, **unverified** current price) | **Recommended** |
| (b) Amplify Hosting | Not documented for 16 | Low | Pay per request | Rejected until AWS documents Next.js 16 |
| (c) OpenNext on Lambda + CloudFront | Not confirmed for 16 | Medium (adapter upgrades track Next releases) | Lowest when idle | Second choice; revisit if idle cost matters more than predictability |
| (d) Vercel | Full | Lowest | Per seat + usage | Rejected: data would leave AWS and the chosen region, complicating I7 residency, and AWS access needs long-lived keys or OIDC federation |

### 4.2 Target topology (per stage)
```
Route 53 ─► CloudFront (TLS, static assets cached, WAF) ─► ALB (private to CloudFront) ─► ECS Fargate service (Next.js standalone, 2+ tasks, 2 AZs)
                                                                                           │  task role (least privilege)
                                                                                           ▼
                                                                        DynamoDB · SQS · SSM · S3 (F2) · AppSync Events (I8)
API Gateway HTTP API ─► webhook Lambda (unchanged)        SQS ─► sender Lambda (unchanged)
```
- **Task role** replaces the developer credentials. Its policy is the sample in `services/whatsapp/README.md`, scoped to the stage's tables, indexes, queue and parameters, plus what F2/I8 add.
- **No public access to the ALB:** only CloudFront's managed prefix list may reach it, so the WAF can't be bypassed.
- **Health check:** `GET /api/health` (I9 §4.5).
- **Autoscaling:** CPU target 60 %, min 2 tasks in `prod` (one per AZ), min 1 in `staging`.
- **Logs:** container stdout → CloudWatch Logs, same JSON shape as the Lambdas (I9 §4.6).

### 4.3 Infrastructure as code
- Keep `services/whatsapp/serverless.yml` for the data plane and Lambdas (it works and is documented).
- Add a second stack for the web tier (`infra/web/`), in AWS CDK (JavaScript) or CloudFormation, which reads table ARNs, queue ARN and parameter names from the first stack's outputs. Serverless Framework is a poor fit for ECS, CloudFront and WAF.
- Both stacks are deployed by the pipeline only. Console changes are not allowed in `prod` (drift detection monthly).

### 4.4 Environments
| Stage | Purpose | Data | Meta number | Who deploys |
|---|---|---|---|---|
| `dev` | Feature work, smoke tests | Fake | Meta test number | Developer or CI on merge to `main` |
| `staging` | Release candidate, M9 scenarios | Fake, refreshed | Second test number | CI on release tag `vX.Y.Z-rc.N` |
| `prod` | Customers | Real | Customers' numbers (I3) | CI on release tag `vX.Y.Z`, with manual approval |

- **Separate AWS accounts** for `prod` and non-prod (AWS Organizations), so a mistake in `dev` cannot touch customer data (D2).
- Each stage has its own Meta app or at least its own webhook configuration, secrets and domain (`app.<domain>`, `staging.<domain>`).

### 4.5 CI/CD pipeline (GitHub Actions; D3)
1. **On every PR:** install, lint, `next build`, `serverless package --stage dev`, the narrow test set from I9 D5, dependency audit (`npm audit --omit=dev` at high severity) and secret scanning.
2. **On merge to `main`:** build the container image (tagged with the git SHA), push to ECR, deploy the data stack then the web stack to `dev`, run the scripted smoke test (I9 §4.9).
3. **On a release tag:** promote the **same image** to `staging`, run M9 scenarios, then wait for manual approval and deploy to `prod`.
4. **Deploy order** (matters for F3-type changes): data stack (tables, GSIs) → Lambdas → backfills → web tier. The pipeline encodes it.
5. **Auth to AWS:** OIDC role per account; no access keys in GitHub. `SERVERLESS_ACCESS_KEY` is a GitHub environment secret.
6. **Rollback:** ECS keeps the previous task definition; rollback is redeploying the previous image tag (one pipeline input). Lambdas roll back by redeploying the previous tag. Data migrations must be backward compatible for one release (expand → migrate → contract).

### 4.6 Edge security and HTTP hardening
- WAF on CloudFront: AWS managed core rule set, known bad inputs, IP reputation list, and a rate-based rule on `/api/auth/*` (with I6's application-level throttling as the primary control).
- Security headers in `next.config.mjs`: `Strict-Transport-Security` (1 year, includeSubDomains), `Content-Security-Policy` (self, plus the AppSync and S3 origins from F2/I8), `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, `Permissions-Policy` minimal. `Referrer-Policy: same-origin` already exists.
- `NODE_ENV=production` guaranteed by the image, so cookies are `Secure`.
- The webhook stays on API Gateway; add a WAF or API Gateway throttling on it (signature check already rejects forged calls, `webhook.js:37`).

### 4.7 Domains and email
- One product domain (D4), with `app.`, `staging.`, `status.` (I9) and a mail subdomain for SES (I8) with SPF, DKIM and DMARC.
- TLS certificates from ACM (in `us-east-1` for CloudFront).

## 5. Affected modules and files
- **M7/M8:** `apps/web/next.config.mjs` (`output: 'standalone'`, security headers), new `apps/web/Dockerfile`, `.dockerignore`; `apps/web/instrumentation.js` (unchanged behaviour, now reads the task role); new `app/api/health/route.js` (I9).
- **M1:** `services/whatsapp/serverless.yml` (export ARNs for the web stack; per-stage params); new `infra/web/` (CDK or CloudFormation: VPC, ECS cluster and service, ALB, CloudFront, WAF, ACM, Route 53, ECR, task role).
- **New:** `.github/workflows/ci.yml`, `deploy.yml`; `CODEOWNERS`; branch protection on `main`.
- **Docs:** `docs/deployment.md` (production section, environments, release and rollback), `docs/runbook.md` (I9), `docs/PRD.md` §Deferred (remove "Production deployment").

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Hosting option? | **ECS Fargate + ALB + CloudFront, standalone container.** Re-check Amplify/OpenNext support for Next.js 16 at build time; switch only if documented |
| D2 | Separate AWS accounts for prod? | **Yes**, prod and non-prod in separate accounts under one AWS Organization |
| D3 | CI provider? | **GitHub Actions with OIDC**, assuming the repo is on GitHub |
| D4 | Product domain and brand? | **Needs the owner's choice.** "Vartalap" is the working name; check trademark and domain availability before buying |
| D5 | Primary region? | **Stay on `ap-south-1` for the first customers** if they are in India/MEA; add `ap-southeast-1` (Singapore) or `me-central-1` (UAE) per I7 residency demand |
| D6 | Keep Serverless Framework v4? | **Yes for now.** If its license becomes a material cost, migrate the Lambdas to the same CDK app as the web tier |

## 7. Risks
- **Next.js 16 on managed hosts:** an unsupported feature (edge middleware is not supported on Amplify) could break auth redirects. The container option avoids this; Next.js 16 renamed middleware to `proxy.js` (as referenced in F3), which runs on the Node runtime in a container.
- **Always-on cost:** Fargate charges while idle. Acceptable once there is one paying customer; use one task in `staging`.
- **Two IaC tools** (Serverless + CDK) add cognitive load. Mitigated by keeping a clear split (data/Lambdas vs web tier) and documenting it.
- **Cut-over:** moving the first real customer from localhost to the hosted app changes the URL; sessions are re-issued. Plan it with the I3 onboarding of that customer.
- **Secret handling** in the new task role must follow I6 (SecureString/Secrets Manager), or the move to production widens exposure of plain `String` parameters.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Hosted `dev` | Standalone build and Dockerfile; ECR; web stack (VPC, ECS, ALB, CloudFront, ACM, Route 53); task role; health check; security headers | M |
| 2. Pipeline | GitHub Actions CI on PR; deploy to `dev` on merge; OIDC roles; smoke test after deploy | M |
| 3. Staging and prod | Separate prod account; `staging` and `prod` stages; release tags with approval; rollback runbook; WAF rules; drift detection | M |
| 4. Polish | Status subdomain, SES domain, cost alarms (AWS Budgets) per account | S |

## 9. Acceptance criteria
- [ ] `https://app.<domain>` serves the app with a valid certificate, HSTS and the security headers; the session cookie has `Secure`, `HttpOnly`, `SameSite=Lax`.
- [ ] The running web tasks use their own task role; revoking the developer's credentials does not affect the hosted app.
- [ ] The ALB rejects requests that don't come through CloudFront.
- [ ] A PR with a lint or build error can't be merged; merging to `main` deploys to `dev` with no manual step.
- [ ] Promoting a release tag deploys the exact image tested on `staging` to `prod` after approval; rolling back to the previous tag takes under 15 minutes.
- [ ] `prod` and non-prod live in different AWS accounts; no developer has standing write access to `prod` data.
