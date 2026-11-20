# CA CRM

A lightweight, mobile-first CRM for Chartered Accountant (CA) firms. This branch contains the
boilerplate only: a health check API and a "coming soon" PWA.

- Backend: API Gateway (REST, one shared API) + Lambda (Node.js 20, CommonJS), Serverless Framework v3. See `../app-builder/instructions/backend-architecture.md`.
- Frontend: React + Vite + Tailwind CSS v4 + vite-plugin-pwa, served from a private S3 bucket through CloudFront. See `../app-builder/instructions/frontend-architecture.md`.

## Prerequisites

- Node.js 20 or newer (tested with Node 26) and npm.
- [Granted](https://granted.dev) with the `CoderAnubhav95` profile. It is the only AWS profile that may be used.
- Serverless Framework v3 is a local devDependency. No global install and no Serverless account are needed.

## Deploy

From this folder:

```bash
assume CoderAnubhav95 --exec "node deploy.js --stage prod"
```

This installs dependencies if missing, deploys the backend (API Gateway stack, then the services in
parallel), then the frontend (hosting stack, build with the API URL, upload, CloudFront invalidation),
and prints:

```text
================ ca-crm deployed (account <id>, ap-southeast-1, stage prod) ================
  API:       https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/prod
  Health:    https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/prod/health
  Frontend:  https://<dist>.cloudfront.net
```

Defaults: stage `prod`, region `ap-southeast-1`. Every script accepts `--stage` and `--region`.

Partial deploys:

```bash
cd backend  && assume CoderAnubhav95 --exec "node deploy.js --stage prod"          # API Gateway + all services
cd backend  && assume CoderAnubhav95 --exec "node deploy.js --stage prod health"   # API Gateway + named services
cd frontend && assume CoderAnubhav95 --exec "node deploy.js --stage prod"          # needs the backend deployed
```

`frontend/deploy.js` reads the API URL from the `ApiBaseUrl` output of `ca-crm-api-gateway-<stage>`.
Set `API_BASE_URL` to override it.

## Undeploy (destructive)

Removes the frontend, then the backend. Asks you to type the stage name unless `--yes` is passed.

```bash
assume CoderAnubhav95 --exec "node undeploy.js --stage prod"
```

## Stacks (stage `prod`)

| Stack | Source | Outputs |
|---|---|---|
| `ca-crm-api-gateway-prod` | `backend/infra/api-gateway/serverless.yml` | `RestApiId`, `RestApiRootResourceId`, `ApiHost`, `ApiBaseUrl` |
| `ca-crm-health-prod` | `backend/services/health/serverless.yml` | Serverless defaults (`ServiceEndpoint`, layer and function ARNs) |
| `ca-crm-frontend-prod` | `frontend/infra/hosting/serverless.yml` | `BucketName`, `DistributionId`, `DistributionDomainName`, `SiteUrl` |

## Local development

```bash
cd frontend
cp .env.example .env.local   # set VITE_API_BASE_URL to a deployed ApiBaseUrl
npm install
npm run dev                  # UI only; the service worker is not active in dev
npm run build && npm run preview   # to check offline/PWA behavior
```

## API

`GET /health?clientTs=<ISO timestamp>` returns
`{ "status": "ok", "serverTimestamp": "...", "clientTimestamp": "..." | null }`, or `400` if `clientTs` is not a valid timestamp.
