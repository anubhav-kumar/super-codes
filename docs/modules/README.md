# Vartalap Modules

The build is split into modules. Each module has its own file in this folder: scope, files, interfaces, dependencies and a "done when" checklist.

Requirements: [`docs/PRD.md`](../PRD.md) · Architecture: [`docs/arch/boilerplate.md`](../arch/boilerplate.md)

## Index
| ID | Module | Depends on | Status |
|---|---|---|---|
| [M0](m0-foundation.md) | Foundation and contracts | — | Done |
| [M1](m1-infra.md) | AWS infrastructure | M0 | Built (not yet verified on AWS) |
| [M2](m2-core-messages.md) | Core: messages (linked list) | M0 | Built (not yet verified on AWS) |
| [M3](m3-core-users-auth.md) | Core: users and auth | M0 | Built (not yet verified on AWS) |
| [M4](m4-core-chats.md) | Core: chats, access rules, assignment | M0 (uses M3 interfaces) | Built (not yet verified on AWS) |
| [M5](m5-webhook-lambda.md) | Webhook Lambda | M1, M2, M4 | Built (not yet verified on AWS) |
| [M6](m6-sender-lambda.md) | Sender Lambda | M1, M2 | Built (not yet verified on AWS) |
| [M7](m7-web-api.md) | Web API routes | M2, M3, M4 (+ M1 for real resources) | Built (not yet verified on AWS) |
| [M8](m8-web-ui.md) | Web UI | M0 contracts, M7 (real API, no mocks) | Built (not yet verified on AWS) |
| [M9](m9-e2e.md) | End-to-end integration | All | Not started |

**External prerequisite:** the client business sets up its Meta WhatsApp Business account (app, phone number ID, access token, app secret, test number). Start this now; M5, M6 and M9 cannot be verified without it.

## Dependency graph
```
            ┌─► M1 Infra ───────────────┬─► M5 Webhook ─┐
            │                            ├─► M6 Sender ──┤
M0 ─────────┼─► M2 Messages ────────────┤               │
(contracts) ├─► M4 Chats/rules ─────────┼─► M7 Web API ─┼─► M9 E2E
            └─► M3 Users/auth ──────────┘       │       │
                                    M8 Web UI ◄─┘ ──────┘
Meta setup (client) ──────────────────────────────────────► M5/M6/M9
```

## Phases
| Phase | Modules | Notes |
|---|---|---|
| 1 | M0 | Keep it small, but get the contracts right. They are what make phase 2 parallel. |
| 2 | M1, M2, M3, M4 | Four parallel streams. |
| 3 | M5, M6, M7, then M8 | M5 and M6 need M1 + M2. M7 needs M2 + M3 + M4. M8 is built against the real M7 API (no mock mode). |
| 4 | M9 | Full round trip with a real WhatsApp number. |

- **Critical path:** M0 → M1 → M2 → M5 → M9.
- **Schedule risk:** Meta credentials (block M5 verification). Deployment tool decided: Serverless Framework v4.
- **Correctness risk:** M2 (the linked-list append). Everything relies on it, so it gets the most careful review.

## Conventions for every module
- JavaScript only (ES modules); no TypeScript.
- Interfaces listed under "Exposes" are the contract other modules code against. Change them only by updating M0 and every module file affected.
- No secrets in code or docs; use `.env` locally and SSM in AWS.
- Do not log message bodies or full phone numbers.
- Update the Status column above when a module starts or finishes.
