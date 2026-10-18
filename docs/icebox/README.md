# Vartalap Icebox

Parked features: researched but not scheduled. They use the same note template as [`docs/features/`](../features/README.md).

**IDs:** icebox items use the **I** series (I1, I2, …), and the number is fixed while the item is parked. An I number is never reused once its item moves out. Moved so far: I4 → [F5](../features/f5-templates-and-reengagement.md) (2026-10-18). To schedule one:
1. Give it the next free **F** number (after the highest in [`docs/features/`](../features/README.md)).
2. Move and rename its note, e.g. `i3-whatsapp-onboarding.md` → `docs/features/f5-whatsapp-onboarding.md`, and change the heading to the F ID.
3. Add it to the features index and delete its row here.
4. Update references to the old I ID: other icebox notes and both indexes.

| ID | Feature | Note | Status |
|---|---|---|---|
| I1 | Production hosting, environments and CI/CD | [i1-production-hosting.md](i1-production-hosting.md) | Icebox (research) |
| I2 | Multi-tenant workspaces | [i2-multi-tenant-workspaces.md](i2-multi-tenant-workspaces.md) | Icebox (research) |
| I3 | Self-serve WhatsApp number onboarding (Tech Provider, Embedded Signup) | [i3-whatsapp-onboarding.md](i3-whatsapp-onboarding.md) | Icebox (research) |
| I5 | Plans, billing and subscriptions | [i5-billing-subscriptions.md](i5-billing-subscriptions.md) | Icebox (research) |
| I6 | Account security, roles and audit log | [i6-account-security.md](i6-account-security.md) | Icebox (research) |
| I7 | Data protection and compliance | [i7-data-protection-compliance.md](i7-data-protection-compliance.md) | Icebox (research) |
| I8 | Real-time updates and notifications | [i8-realtime-notifications.md](i8-realtime-notifications.md) | Icebox (research) |
| I9 | Reliability, observability and support operations | [i9-reliability-observability.md](i9-reliability-observability.md) | Icebox (research) |
| I10 | Inbox productivity: status, search, quick replies, business hours, routing | [i10-inbox-productivity.md](i10-inbox-productivity.md) | Icebox (research) |
| I11 | Reporting and analytics | [i11-reporting-analytics.md](i11-reporting-analytics.md) | Icebox (research) |
| I12 | Public API, outbound webhooks and integrations | [i12-public-api-integrations.md](i12-public-api-integrations.md) | Icebox (research) |

## Production readiness (I1–I12)
I1–I12 take Vartalap from a single-business trial to a product other businesses pay for. They were written on 2026-10-17 from the code and the M-series docs, plus Meta, AWS, Stripe and regulator pages checked that day.

**Assumptions (change them in the notes' open decisions if wrong):**
- **Hosted, multi-tenant service:** paying customers are businesses on a multi-tenant service we host (I2). A dedicated stack per customer, today's model, stays available as a premium plan with the same code.
- **Terms:** *workspace* or *customer* = a paying business. *Client* keeps its existing meaning: the WhatsApp end user.
- **Meta billing:** we become a Meta **Tech Provider**, and customers pay Meta for WhatsApp messages directly (I3 D2).
- **Prices:** plan prices in I5 are a hypothesis based on competitors' published pricing, to be validated with prospects.

**Launch tiers:**
| Tier | Features | Why |
|---|---|---|
| **A. Can't charge without** | I1 hosting, I2 workspaces, I3 onboarding, I5 billing, I6 Phase 1 security, I7 Phase 1 legal pack + erasure/export, I9 Phase 1 no-message-loss + alarms | Without these there is no URL to sell, no way to add a second customer, no way to get paid, or unacceptable legal/security exposure |
| **B. Needed to keep paying customers** | Deploy and verify F2–F4 on `dev`; F5 Phase 1 templates in chats; I8 Phases 1–2 real-time + alerts; I10 Phases 1–3 | Table-stakes inbox features every competitor has; without templates, chats die after 24 h |
| **C. Upsell and retention** | F5 Phase 3 broadcasts, I6 Phase 3 SSO/roles, I11 reports, I12 API and integrations, I7 Phase 3 residency | Justify the higher plan, win larger customers |

**Suggested order (when taken out of the icebox):**
1. **Start now (no code):** I3 Phase 0, Meta business verification and App Review, which take weeks of calendar time. In parallel, the I7 legal pack with counsel and the I5 D5 legal entity and tax question.
2. **I9 Phase 1.** Small, and it fixes a live bug: the webhook returns `200` when storing a message fails, so that message is lost.
3. **I1 Phases 1–2,** then **I2 Phases 1–2.** I2 is the largest refactor, so do it once and before customer #2. It re-keys every table, including F4's `ClientNotes` and F2's S3 keys.
4. **I6 Phase 1, I3 Phase 1, I5 Phases 1–2, I7 Phase 1.** At this point self-serve signup → connect → pay works. This is the commercial launch.
5. **F5 Phase 1, I8 Phases 1–2, I10 Phase 1.**
6. Tier C by customer demand.
