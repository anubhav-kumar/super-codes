# Vartalap Features

Post-v1 features, built on top of modules M0–M8 ([`docs/modules/`](../modules/README.md)). Each feature has a research note here: the current state, findings, a proposed design, open decisions and a phased plan. A note is reviewed and its open decisions are answered before implementation starts.

| ID | Feature | Note | Status |
|---|---|---|---|
| F1 | Modern UI polish | [f1-ui-polish.md](f1-ui-polish.md) | Built (P1–P3; P4 unread counts deferred) |
| F2 | Media messages: images, video, video notes, audio and more | [f2-media-messages.md](f2-media-messages.md) | Built (P1–P3; P4 partly; not yet deployed, verify on dev) |
| F3 | Hide the client's phone number from agents | [f3-hide-client-phone.md](f3-hide-client-phone.md) | Built (P1–P3; P4 masking numbers in message text deferred per D4; needs deploy + backfill + dev reset) |
| F4 | Client attributes: description, notes, tags | [f4-client-attributes.md](f4-client-attributes.md) | Built (P1–P3; needs deploy for the ClientNotes table; tests and erasure routes deferred) |
| F5 | Template messages, opt-in/opt-out and re-engagement (was I4) | [f5-templates-and-reengagement.md](f5-templates-and-reengagement.md) | Research (moved from the icebox 2026-10-18; open decisions to answer) |

Parked features (I1–I12 except I4, which became F5; production readiness) are in [`docs/icebox/`](../icebox/README.md). They keep an I ID while parked and get the next F number when moved here (see the icebox README).

## Dependencies and suggested order (F1–F4)
- **F3 first:** it changes chat IDs in every URL and API path, and inbound message IDs. Its research confirmed that WhatsApp message IDs embed the client's phone number. F2 and F4 add new routes under the chat, and F2 puts message IDs into S3 keys and media URLs, so both build on F3's opaque IDs.
- **F1 and F3 can run in parallel:** F1 is mostly CSS and components, and it already avoids showing phone digits.
- **F4 after F3:** it fills F1's client details panel, or a collapsible header section if F1 isn't done yet.
- **F2 after F3 Phase 2:** it is the largest feature, with new infrastructure (an S3 bucket, a media queue and Lambda, malware scanning).

## Note template
Every note uses the same sections:
1. **Goal**: the problem and who it's for.
2. **Current state**: how the code behaves today, with file references.
3. **Research findings**: external facts with source links. Anything unverified is labelled as such.
4. **Proposed design**: data model, API, UI, infrastructure, security and privacy.
5. **Affected modules and files.**
6. **Open decisions**: questions for the product owner, each with a recommended default.
7. **Risks.**
8. **Phased plan and effort**: S, M or L per phase.
9. **Acceptance criteria.**
