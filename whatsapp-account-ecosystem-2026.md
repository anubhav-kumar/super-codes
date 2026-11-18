# WhatsApp Cloud API — Account & Identity Ecosystem (2026)

> Brief map of how personal Facebook accounts, Pages, business portfolios,
> WhatsApp accounts (WAACs), and Messaging accounts relate in the
> 2026 WhatsApp Cloud API. Verified against Meta's official Cloud API docs
> (fetched 2026-10-20; see Sources).

## TL;DR

- **Personal Facebook account = your Meta login / identity anchor.** A Page is
  *not* a prerequisite for the Cloud API in 2026 — the Get Started
  prerequisites are: (1) a Facebook account **or** managed Meta account,
  (2) developer registration, (3) a WhatsApp-enabled test device.
- **WABA is gone as a thing you create.** A single WhatsApp Business account
  (WABA) has split into **two account types**:
  - **WhatsApp account (WAAC)** — holds one business phone number; your
    presence on WhatsApp. One number → one WAAC.
  - **Messaging account** — holds message templates + billing; **one per
    partner** you work with.
- **Two big 2026 shifts:** (1) the WABA → WAAC + Messaging-account split
  (GA Sept 23 2026, full rollout mid-Oct 2026); (2) deprecation of the
  legacy **2FA PIN** for eligible numbers (register calls still accept a
  valid `pin` parameter as a no-op until Meta announces a contract change).

## Hierarchy

```
Personal Facebook account (or managed Meta account)   ← your Meta identity / login
│
├─ Developer registration (developers.facebook.com)
│
├─ Meta App (App ID)
│   Created for the "Connect with customers through WhatsApp" use case,
│   bound to a Business Portfolio at creation time.
│
├─ Business Portfolio
│   The shared business asset container (contacts, assets, billing
│   relationships). Verified portfolios raise the per-Messaging-account
│   template cap (250 unverified → up to 6,000 verified).
│   │
│   ├─ WhatsApp account (WAAC) ────────── one per phone number
│   │   │  Holds exactly ONE business phone number; number is registered
│   │   │  here (POST /<business_phone_number_id>/register). WhatsApp
│   │   │   users see a single trusted contact. WAACs can be linked into
│   │   │   a hierarchy (manage a collection of numbers as a group).
│   │   │
│   │   └─ Business phone number — the WAAC is the unit of the Cloud API;
│   │       all messaging, webhooks are scoped per WAAC.
│   │
│   └─ Messaging account ─────────────── one per partner (you, or each
│        │   tech-provider/solution partner)
│        │  Holds templates + billing. Sharing a WAAC across partners
│        │  = each partner gets its own Messaging account, so billing is
│        │  separate per partner.
│        │
│        └─ Message templates (cap set by parent portfolio verification)
│
└─ Access token (scoped by role)
    - Direct developer → System User token
    - Tech Provider → Business Integration System User (BITSU) token
      (scoped to each individually onboarded customer)
    - Solution partner → System User token to share credit with new
      customers; BITSU for everything else
```

Old-world terms, for reference: the legacy **WABA** maps to *one WAAC per
number + one or more Messaging accounts*; **WABA ID (whatsapp_business_
account_id)** is still used by older API versions but is being superseded —
see the rollout table below.

## Edge-by-edge relationships (practice notes)

| Edge | Relationship in the 2026 model |
|---|---|
| Personal FB account → Meta app | You sign in with your personal (or managed Meta) account to create the app; it lives inside a Business Portfolio. No Page needed anywhere in the Cloud API prerequisites. |
| Meta app → Business Portfolio | Chosen/created at app creation ("Select an existing business portfolio or create a new one"). The portfolio's **verification status** gates template limits. |
| Portfolio → WAAC | One WAAC per business phone number. Numbers are registered/verified here via OTP. WAACs can be grouped in a hierarchy. |
| Partner → Messaging account | **One Messaging account per partner**. This is the new key axis: a client can share their WAAC with multiple partners and each partner has independent templates + billing. |
| Messaging account → templates | Count is capped by the *parent portfolio*: **250** unverified, up to **6,000** verified (with an approved display name). |
| System user → API calls | Token choice is role-based: System User (direct dev), BITSU (tech provider / partner per-customer), or both (solution partner). |

## The two big 2026 shifts

### 1. WABA → WAAC + Messaging account (GA Sept 23 2026)

- "A WhatsApp Business account is evolving into two unique accounts: one for
  phone numbers (WAAC), one for template messages and billing (Messaging
  account)."
- Under the new model, clients and direct developers can share a phone
  number with multiple partners; each partner keeps separate billing.
  WhatsApp end-users still see a single trusted contact.
- Until a business is migrated, WhatsApp Manager / Meta Business Suite keep
  showing the legacy WABA. Migration itself is done **by Meta, automatically,
  in stages**.

| Phase | Timing | What happens |
|---|---|---|
| **Phase 1 — General availability** | Rolling out from **Sept 23 2026**, reaching all businesses by **mid-Oct 2026** | Meta handles the account migration automatically; new account model live. |
| **Phase 2 — New Graph API version** | Follow-up (per doc) | New API version exposes the split model. |
| **Phase 3 — Mandatory transition** | **H1 2028** | `messaging_account_id` required in all Messages API versions for multi-Messaging-account setups; APIs that target phone number IDs must use the new targeting. |

### 2. 2FA PIN deprecation (eligible numbers)

- The 6-digit two-factor **PIN is being deprecated** for eligible Cloud API
  phone numbers, rolling out with Phase 1.
- Eligible numbers: the **Two-step verification** tab disappears from
  WhatsApp Manager — there is no PIN to create, reset, or disable.
- API behavior: Meta no longer uses the supplied PIN to validate
  registration and clears any residual PIN state — but you must
  **continue sending a valid 6-digit `pin` parameter** in
  `POST /<BUSINESS_PHONE_NUMBER_ID>/register` calls until Meta announces a
  separate API-contract change. (i.e., the param is accepted as a **no-op**.)
- Everything else for security is unchanged: OTP verification of number
  ownership, token/permission enforcement, cross-account number protections,
  registration rate limits, 2FA inside the WhatsApp/WhatsApp Business apps.

## Practical takeaways for a 2026 integration (e.g., this repo)

1. **Onboarding surface:** collect a personal FB login (or managed Meta
   account), developer registration, and a Business Portfolio. Don't ask
   clients for a Page.
2. **Store the right IDs:** in the new model your stable keys are the
   **WAAC ID(s)** (per phone number) and the **Messaging account ID**; start
   migrating any WABA-ID-centric logic now — `messaging_account_id` becomes
   mandatory for multi-Messaging-account setups in H1 2028.
3. **Register call:** keep passing a valid 6-digit `pin` (harmless no-op),
   drop any user-facing PIN management — the tab is disappearing.
4. **Tokens:** if you are a direct developer on your own data → System User
   token; if you onboard *other* clients → use BITSU tokens per customer.
5. **Template capacity:** plan around portfolio verification — 250 templates
   unverified vs up to 6,000 verified per Messaging account.

## Sources (all fetched 2026-10-20)

- Get Started — `developers.facebook.com/documentation/business-messaging/whatsapp/get-started`
- WhatsApp accounts and Messaging accounts — `.../whatsapp/whatsapp-business-accounts`
- Account model evolution (WABA → WAAC + Messaging account; phase table) — `.../whatsapp/account-model-evolution`
- Onboarding under the new model — `.../whatsapp/account-model-evolution/onboarding`
- Access tokens (System User vs Business Integration System User) — `.../whatsapp/access-tokens`
- Business phone numbers & registration — `.../whatsapp/business-phone-numbers/phone-numbers`, `.../business-phone-numbers/registration`
- Template limits (250 / 6,000 by portfolio verification) — `.../whatsapp/templates/overview#template-limits`
