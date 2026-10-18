# I5: Plans, Billing and Subscriptions

Status: Research · 2026-10-17 · Depends on: I2 (workspaces, operator console), I1 (hosted app) · Related: I3 (Meta billing is separate), F5 (broadcast caps), I9 (SLA), I11 (usage)

## 1. Goal
Get paid without manual invoicing: a business signs up, gets a free trial, picks a plan, pays by card, adds or removes seats, and is reminded, restricted and finally suspended if payment fails, all without the operator touching anything. Plans also gate features (broadcasts, reports, numbers) so there is a reason to upgrade.

**Who it's for:** workspace admins (buy, change, cancel, download invoices) and you (revenue, dunning, overrides). **Out of scope:** paying Meta for customers' WhatsApp messages; customers pay Meta directly on their WABA (I3 D2).

## 2. Current state
- **No commercial layer at all:** no signup page (a seed script creates the first admin, `scripts/seed-admin.js`; `docs/deployment.md` §4), no plans, no trial, no payment, no usage counters, no limits on users or chats.
- **No workspace object** to attach a subscription to until I2 (`Workspaces.status`, `plan`).
- **Users:** admins create users freely (`apps/web/app/api/users/route.js`, `packages/core/src/users/repo.js:68`), so seat limits have no enforcement point yet.

## 3. Research findings
- **Market pricing** (vendor pricing pages, monthly billing, checked 2026-10-17 by the research agent; annual is typically 15–25 % less):

  | Vendor | Plans (per month) | Seats included / extra seat | Notes |
  |---|---|---|---|
  | [respond.io](https://respond.io/pricing) | USD 99 / 199 / 349 | 5 / USD 12; 10 / USD 20; 10 / USD 24 | Also priced on monthly active contacts; WhatsApp fees via prepaid top-up |
  | [Trengo](https://trengo.com/pricing) | EUR 349 / 599 | 10 / EUR 30; 20 / EUR 50 | Conversation caps (500 / 1,500 a month); AI surcharge per conversation |
  | [WATI](https://www.wati.io/pricing/) | USD 69 / 149 / 349 (**unverified**: page didn't render) | 3 / –; 5 / USD 24; 5 / USD 69 | Reported markup on Meta fees (**unverified**) |

  Takeaway: base plans of about USD 69–599 a month including 3–20 seats, extra seats at about USD 12–69.
- **Stripe Billing** covers what's needed:
  - Per-seat pricing through subscription **quantity** ([Stripe: quantities](https://docs.stripe.com/billing/subscriptions/quantities)).
  - Usage-based prices through **Billing Meters**, now Stripe's only usage-based option; the legacy usage-records API was removed in API version `2025-03-31.basil` ([usage-based billing](https://docs.stripe.com/billing/subscriptions/usage-based), [migration guide](https://docs.stripe.com/billing/subscriptions/usage-based-legacy/migration-guide)).
  - Hosted **Checkout** for the first payment ([Checkout](https://docs.stripe.com/payments/checkout)) and the hosted **customer portal** for plan changes, payment methods, invoices and cancellation ([customer management](https://docs.stripe.com/customer-management)).
  - **Stripe Tax** to calculate and collect sales tax, VAT and GST where we are registered ([Stripe Tax](https://docs.stripe.com/tax)).
  - Webhooks for subscription and invoice events; Smart Retries and dunning emails for failed payments (Stripe docs, [S], not re-read).
- **Tax registration** (GST in Singapore, VAT in the UAE and KSA, etc.) depends on where our business is incorporated and where customers are. **Unverified**; needs an accountant before the first invoice (D5).

## 4. Proposed design

### 4.1 Plans (assumption; validate with the first 5–10 prospects)
| | Trial | Starter | Business | Dedicated |
|---|---|---|---|---|
| Price (USD, monthly) | Free, 14 days | 49 / workspace incl. 3 seats | 149 / workspace incl. 10 seats | From 1,000, annual contract |
| Extra seat | – | 15 | 20 | Included per contract |
| WhatsApp numbers | 1 | 1 | 3 | Per contract |
| Inbox, assignment, status, quick replies, notes/tags (F4, I10) | ✓ | ✓ | ✓ | ✓ |
| Templates in chats (F5 Phase 1–2) | ✓ | ✓ | ✓ | ✓ |
| Broadcasts (F5 Phase 3) | – | – | 10,000 recipients/month | Per contract |
| Reports (I11) | Overview | Overview, Delivery | All + CSV | All |
| API and webhooks (I12) | – | – | ✓ | ✓ |
| SSO, audit log export (I6) | – | – | Audit log | SSO + audit export |
| Data residency choice, own AWS account (I2 D1, I7) | – | – | – | ✓ |
| Support / SLA (I9 D1) | Email | 1 business day | 4 business hours, 99.5 % | Named contact, custom SLA |

- Annual billing at two months free (≈ 17 % off), matching the market.
- Prices in USD first; SGD, AED, SAR and INR price points later (D4).
- Meta's WhatsApp charges are **not** included and are billed by Meta to the customer; the pricing page says so in one line.

### 4.2 Signup and trial
- Public signup page: name, work email (verified by link), password or Google/Microsoft sign-in (I6), workspace name, country (sets timezone and currency hint).
- Creates the workspace in `trial` (I2), the first admin and a Stripe Customer (no card needed for the trial, D2).
- In-app checklist: connect WhatsApp (I3), invite a teammate, send the first reply.
- Trial reminders by email at day 7, 12 and 14 (SES, I8). At expiry without a plan: read-only, inbound still stored (same rule as `suspended`, I2 D5).

### 4.3 Subscription and seats
- **Buy:** "Choose plan" → Stripe Checkout (subscription mode) with the plan price and seat quantity = current active members (minimum included seats).
- **Seat sync:** adding, activating or deactivating a member updates the subscription quantity (prorated) through the Stripe API; inviting beyond the plan's limit on Trial/Starter prompts an upgrade. Deactivated users don't count.
- **Change plan / cancel / payment method / invoices:** Stripe customer portal, opened from Settings → Billing.
- **Usage (Phase 3, optional):** broadcast recipients above the plan allowance reported to a Billing Meter, if overage pricing is chosen (D3).

### 4.4 Entitlements
- `Workspaces.plan` and `limits` are the only things the app reads; it never calls Stripe on the request path.
- A small entitlements module in core: `can(workspace, 'broadcasts')`, `limit(workspace, 'numbers')`. Routes and UI use it; the operator console can override per workspace (deals, pilots).

### 4.5 Stripe webhooks → workspace state
| Stripe event | Effect |
|---|---|
| `checkout.session.completed` | Link `stripeCustomerId`, `stripeSubscriptionId`; `status = active`; set plan and limits |
| `customer.subscription.updated` | Plan, quantity, `cancel_at_period_end` |
| `invoice.paid` | `status = active`, clear dunning |
| `invoice.payment_failed` | `status = past_due` (banner for admins; full access for 14 days, I2 D5) |
| `customer.subscription.deleted` | `status = suspended` (read-only); data kept per I7 then deleted |

- Endpoint `POST /api/billing/webhook` verifies the Stripe signature, is idempotent by event ID, and processes events in any order by re-reading the subscription from Stripe when in doubt.
- Dunning: Stripe Smart Retries and emails; after the final failure, the subscription is cancelled → `suspended`.

### 4.6 Invoices, tax and enterprise
- Stripe invoices with our legal entity details and tax IDs; customers add their VAT/GST number in the portal.
- Stripe Tax enabled for jurisdictions where we register (D5).
- Dedicated/annual contracts: Stripe invoice with bank transfer payment terms (net 30), handled manually through the operator console.

### 4.7 Operator revenue view
- In the operator console (I2 §4.5): MRR, active/trial/past-due counts, trial conversion, churn this month, from our `Workspaces` data plus Stripe; Stripe's own dashboard is the source of truth for revenue figures.

### 4.8 Security and compliance
- No card data touches our servers (Checkout and the portal are Stripe-hosted), keeping PCI scope minimal (SAQ A, **unverified** that this applies to our exact integration; check Stripe's guidance).
- Stripe secret and webhook signing keys in the secret store (I6), never in logs.
- Billing contact details are personal data of the customer's staff: covered by our privacy notice and DPA (I7).

## 5. Affected modules and files
- **Core:** new `billing/` (entitlements, plan definitions, Stripe event handlers), `workspaces/` (status transitions from I2).
- **M7:** new routes `api/signup`, `api/billing/checkout`, `api/billing/portal`, `api/billing/webhook`; `api/users` (seat checks and quantity sync).
- **M8:** public `/signup` and `/pricing` pages; Settings → Billing; trial and past-due banners; upgrade prompts.
- **M1/I1:** Stripe secrets in the secret store; webhook route reachable publicly (excluded from session auth).
- **Operator console (I2):** plan overrides, revenue view.
- **Docs:** pricing page copy, terms of service and refund policy (I7), `docs/deployment.md` (Stripe set-up per environment, test mode in non-prod).

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Prices and packaging? | **§4.1 as the starting hypothesis** (Starter USD 49 incl. 3 seats, Business USD 149 incl. 10 seats). Test with the first prospects; grandfather early customers |
| D2 | Card required for the trial? | **No.** Lower friction matters more than trial abuse at this stage |
| D3 | Usage-based charges (broadcast overage)? | **Not at launch.** Hard caps per plan; add a meter later if customers ask to exceed them |
| D4 | Billing currencies? | **USD at launch**, then SGD/AED/SAR/INR price points once customers ask |
| D5 | Legal entity and tax registration? | **Needs the owner and an accountant** before the first paid invoice: where the company is incorporated decides GST/VAT obligations |
| D6 | Billing provider? | **Stripe**, if available for the legal entity's country; otherwise a merchant of record (e.g. Paddle or Lemon Squeezy), which also handles tax, at a higher fee (**unverified** fees) |
| D7 | Re-sell Meta messaging with a markup? | **No** (Tech Provider, I3 D2). Revisit only if becoming a Solution Partner |

## 7. Risks
- **Pricing wrong** in either direction: mitigated by starting simple, talking to prospects, and keeping prices in Stripe (changeable without a release).
- **Webhook ordering and failures** can leave a workspace in the wrong state: idempotent handlers, re-reading the subscription, a nightly reconciliation job comparing workspaces with Stripe.
- **Seat-sync bugs** over- or under-charge customers: quantity changes logged in the audit log (I6) and visible on invoices with proration lines.
- **Locking customers out loses their clients' messages:** never stop storing inbound messages for non-payment (I2 D5).
- **Tax non-compliance** is a legal risk independent of code (D5).
- **Side-project considerations:** selling a product commercially may involve employment-contract, IP and conflict-of-interest questions with a current employer. Out of scope for this note; check before taking payments.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| 1. Signup and trial | Public signup with email verification; workspace creation in `trial`; trial expiry → read-only; onboarding checklist; reminder emails | M |
| 2. Paid plans | Plans and entitlements; Stripe Checkout and portal; webhook handler; seat sync; past-due and suspended flows; pricing page | M |
| 3. Operations | Operator overrides and revenue view; nightly reconciliation; invoices with tax IDs and Stripe Tax; annual and invoiced contracts | S–M |
| 4. Optional | Usage meters for overage; local-currency price points | S |

## 9. Acceptance criteria
- [ ] A new business signs up, verifies email, and is in a working trial workspace within 2 minutes, with no operator action.
- [ ] Buying Starter with 3 users through Checkout sets the workspace `active` with Starter limits within 1 minute of payment.
- [ ] Inviting a 4th active user on Starter increases the subscription quantity to 4 with a prorated charge; deactivating a user decreases it.
- [ ] A failed renewal sets `past_due` with a banner; after the final retry fails, the workspace becomes read-only but inbound WhatsApp messages are still stored.
- [ ] Replaying the same Stripe webhook event twice has no further effect.
- [ ] Broadcasts are unavailable on Starter (UI hidden, API `403`) and available on Business.
- [ ] No card numbers or Stripe secret keys appear in logs, DynamoDB or the browser beyond Stripe-hosted pages.
