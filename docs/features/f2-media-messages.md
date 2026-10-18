# F2: Media Messages

Status: Built (P1–P3; P4 partly: lazy expiry + client-media deletion script; voice recording and larger documents deferred). Not yet deployed or tested on `dev`. · 2026-10-17 · Depends on: M2, M5, M6, M7, M8, F3

> **Cross-feature dependency on F3 (added in review):** WhatsApp message IDs (`wamid`) embed the client's phone number (confirmed in [F3](f3-hide-client-phone.md) §3). Today an inbound `messageId` is the wamid, so F2 must not ship before **F3 Phase 2** (inbound ULID message IDs), or follow these rules:
> - S3 keys (`in/<messageId>`) and the media route (`/messages/<messageId>/media`) must use the ULID message ID, never a wamid. Presigned URLs carry the S3 key to the browser.
> - All `[phone]` paths in this note become F3's opaque chat ID (`/api/chats/[id]/...`).
> - The media download Lambda keeps using `waMessageId` / Meta `mediaId` server-side only. Neither goes into keys, URLs or API responses.

## 1. Goal
Clients already send photos, voice notes, PDFs (e.g. passport scans, tickets), locations and stickers on WhatsApp. Today agents see only `[unsupported: image]` and have to ask the client to type the content out. F2 lets agents and admins **see, play and download inbound media** in the conversation, and **send images, documents and audio** back, within the same access rules and 24-hour window as text.

Users: agents and admins (staff UI). The client's WhatsApp experience doesn't change.

## 2. Current state
- **Schema:** `MessageSchema.type` is `z.enum(['text'])`, and `text` is a required string (max 4096) (`packages/core/src/schemas/message.js`). There are no media fields. The PRD asked for the schema to "allow media to be added later". A `type` field exists, and nothing else is in place.
- **Append:** `buildMessageItem` copies a fixed set of fields, so a `media` object would be dropped. `buildChatUpdate` sets `lastMessagePreview = item.text.slice(0, 80)` (`packages/core/src/messages/append.js`). Media messages therefore still need a `text` summary.
- **Webhook parse:** any non-`text` type becomes `text: "[unsupported: <type>]"`, and the media ID, caption and filename are thrown away (`services/whatsapp/src/whatsapp/parse.js` → `parseMessage`). `messages[].errors` (e.g. 131052, file too large) is ignored. Statuses outside `sent|delivered|read|failed` are skipped, so the new voice `played` status would be logged as `unknown_status`.
- **Webhook Lambda:** 10 s timeout, 256 MB. It processes items in sequence and returns 200 at the end (`services/whatsapp/serverless.yml`, `src/handlers/webhook.js`). Its IAM role covers only DynamoDB and 3 SSM parameters; the access token is **not** among them.
- **Sender:** `client.js` has only `sendText`. The sender handler always sends type `text` (`src/handlers/sender.js`). Timeout 30 s, queue visibility 180 s.
- **Web API:** `POST /api/chats/[phone]/messages` accepts `{ text }` only (`SendMessageBodySchema`), checks `assertCanSend` and the 24-hour window, appends and enqueues (`apps/web/app/api/chats/[phone]/messages/route.js`).
- **UI:** `Conversation.js` renders `m.text` in every bubble. `Composer.js` is a textarea with a Send button. There is no attach control.
- **Infra:** no S3 bucket. Only the AWS SDK clients for DynamoDB, SQS and SSM are in use.
- **Known limitation (M5):** images, audio, video, documents, stickers, locations, contacts, button/list replies and reactions all arrive as `[unsupported: <type>]`.

## 3. Research findings
Sources are official Meta and AWS pages, checked 2026-10-17. Items marked **(unverified)** need a live test.

### 3.1 Inbound webhook shapes (`entry[].changes[].value.messages[]`)
| `type` | Type-specific object | Notes |
|---|---|---|
| `image` | `image { id, mime_type, sha256, caption, url }` | `url` is being rolled out gradually from 2025-11-12 and may be absent; it still needs the bearer token. [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/image/) |
| `video` | `video { id, mime_type, sha256, caption, url }` | Only one video type exists. **No round/video-note flag.** [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/video/) |
| `audio` | `audio { id, mime_type, sha256, url, voice }` | `voice: true` = recorded in WhatsApp (a voice note); `false` = an audio file. MIME is e.g. `audio/ogg; codecs=opus` (it can carry parameters). [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/audio/) |
| `document` | `document { id, mime_type, sha256, filename, caption, url }` | Whether `filename`/`caption` can be absent isn't stated. [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/document/) |
| `sticker` | `sticker { id, mime_type (image/webp), sha256, url, animated }` | [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/sticker/) |
| `location` | `location { latitude, longitude, name?, address?, url? }` | `url` is usually present only for business locations. [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/location/) |
| `contacts` | `contacts[] { name{formatted_name,…}, phones[], emails[], org, addresses[], urls[], birthday }` | Contains **third-party PII**. [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/contacts/) |
| `reaction` | `reaction { message_id, emoji? }` | No `emoji` means the reaction was removed. It refers to a business message sent in the last 30 days. [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/reaction/) |
| `interactive` | `interactive { type: button_reply\|list_reply, button_reply{id,title} \| list_reply{id,title,description} }`, plus `context.id` | Arrives only as a reply to interactive messages, which Vartalap doesn't send. [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/interactive/) |
| `button` | `button { payload, text }`, plus `context.id` | A quick-reply to a template, e.g. one sent by another system. [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/button/) |
| `unsupported` | `unsupported.type`, `errors[] { code: 131051, … }` | Listed values include `poll_creation`, `poll_update`, `gif`, `edit`, `pin`, `group_invite`, among others. The list is not stated to be exhaustive. [ref](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/unsupported/) |

**Video notes (round video messages):** Meta's Cloud API documentation has **no** video-note message type and no flag for one. The video reference describes a single `video` type, and the unsupported-types list doesn't name video notes. We could not verify how a video note reaches the webhook: as a plain `video` (mp4) or as `unsupported`. **Sending video notes is not supported** (the send API has no such type). Recommendation: send a video note from a test phone to the `dev` stack in Phase 3 and record the observed `type`. Render it as a normal video if it arrives as `video`. If it arrives as `unsupported`, show "Video note (not supported by WhatsApp Cloud API). Ask the client to send it as a video."

### 3.2 Retrieving inbound media ([Media](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media))
- Call `GET /{media-id}` (bearer token). It returns `{ url, mime_type, sha256, file_size, id }`.
- Then `GET <url>` with `Authorization: Bearer <token>` to get the binary. The request fails without the token.
- The **URL expires after 5 minutes.** On a 404, request a new URL.
- A **media ID from a webhook lasts 7 days.** A media ID from an upload lasts 30 days.
- Inbound media is capped at **100 MB**. Bigger files arrive as a webhook error **131052**, and Meta advises asking the customer to resend a smaller file.
- Webhooks now carry `url` directly ([changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog), Nov 2025). Because of the 5-minute expiry and the gradual rollout, always re-resolve through `GET /{media-id}` on retries.

### 3.3 Sending media
- **Upload:** `POST /{phone-number-id}/media` (multipart: `file`, `type`, `messaging_product=whatsapp`) returns `{ id }`. Then send `{ type: 'image', image: { id, caption } }`. Meta recommends `id` over `link` "for better performance". `link` needs a **public** URL, which conflicts with a private bucket (a presigned link would also work but is **not recommended**). [Image messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/image-messages)
- **Captions:** up to 1024 characters (image; we assume the same for video and document, **unverified** for those).
- **Voice notes:** send `audio: { id, voice: true }`. The file must be `.ogg` **OPUS, mono**. Voice notes show a play icon only when ≤ 512 KB. Since 2026-03-17 a `played` status webhook fires the first time a user plays a business voice message. [Audio messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages)
- **Mismatched MIME/extension** returns error **131053**, which is common. Treat it as final (not retryable).
- **24-hour window:** media sends are free-form messages, so the existing window check applies unchanged (PRD; Meta customer-service window).

**Supported types and sizes** (Meta Media page; "MB" units not stated as decimal or binary, so enforce with a small margin):
| Kind | MIME | Max |
|---|---|---|
| Image | `image/jpeg`, `image/png` (8-bit RGB/RGBA) | 5 MB |
| Video | `video/mp4` (H.264 + AAC; Main or Baseline profile recommended), `video/3gpp` | 16 MB |
| Audio | `audio/aac`, `audio/amr`, `audio/mpeg`, `audio/mp4`, `audio/ogg` (OPUS only) | 16 MB |
| Document | pdf, txt, doc/docx, xls/xlsx, ppt/pptx | 100 MB |
| Sticker | `image/webp` static / animated | 100 KB / 500 KB |

### 3.4 AWS limits relevant to the design
- **API Gateway HTTP API:** payload **10 MB**, integration timeout **30 s** (both fixed). [quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html)
- **Lambda:** synchronous payload **6 MB** request/response; asynchronous 1 MB; `/tmp` 512 MB–10 GB; timeout up to 15 min. [quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- Consequence: media bytes must **never pass through the webhook, the API routes or SQS bodies**. The browser uploads straight to S3, and the Lambdas stream between Meta and S3.
- **GuardDuty Malware Protection for S3:** USD 0.09/GB scanned plus about USD 0.215 per 1,000 objects (us-east-1). Free tier is 1 GB and 1,000 objects per month. [pricing](https://aws.amazon.com/guardduty/pricing/) The ap-south-1 rate is **unverified**. Scans tag the object (`GuardDutyMalwareScanStatus`), and a bucket policy can deny reads of untagged or infected objects. The tag mechanics come from AWS docs as we recall them and are **unverified** against the current docs.

## 4. Proposed design

### 4.1 Per-type support matrix
| Type | Inbound (Cloud API) | Outbound (Cloud API) | F2 inbound | F2 outbound |
|---|---|---|---|---|
| Image (jpeg/png) | Yes | Yes, 5 MB | **P1** | **P2** |
| Document | Yes, ≤ 100 MB | Yes, 100 MB | **P1** | **P2** (capped, see D3) |
| Audio file | Yes | Yes, 16 MB | **P1** | **P2** (upload a file) |
| Voice note | Yes (`voice: true`) | Yes (ogg/opus mono) | **P1** (plays as audio) | P4 (in-browser recording needs transcoding) |
| Video | Yes | Yes, 16 MB | **P3** | **P3** |
| Video note (round) | Not documented (unverified) | **No** | P3: verify, then show as video or a placeholder | No |
| Sticker | Yes (static/animated webp) | Yes | **P1** (render as an image) | No |
| Location | Yes | Yes | **P1** (map link) | No |
| Contacts card | Yes | Yes | **P1** (name plus phone count; see D6) | No |
| Reaction | Yes | Yes | **P1** (badge on the target message) | Later |
| Button / interactive reply | Yes | n/a (we send neither) | **P1** (as text: title) | n/a |
| Unsupported (polls, etc.) | `unsupported` + 131051 | n/a | P1: clearer placeholder | n/a |

### 4.2 Data model (`Messages`; additive and backward compatible)
```js
type: z.enum(['text','image','video','audio','document','sticker','location','contacts','interactive','button','unsupported'])
text: string            // still required: caption, or a summary such as "[Photo]" or "[Voice note 0:12]"; drives lastMessagePreview
media?: {               // image | video | audio | document | sticker
  waMediaId: string|null,  // inbound: from the webhook (7 days); outbound: from the upload (30 days), cached for retries
  s3Key: string|null,      // 'in/<messageId>' or 'out/<messageId>'; no phone number in keys
  mimeType, size?, sha256?, filename?, durationSec?, voice?: bool, animated?: bool,
  state: 'pending'|'ready'|'failed'|'too_large'|'expired',  // the file's own lifecycle, separate from delivery status
  errorCode?: string
}
location?: { latitude, longitude, name?, address? }
contacts?: [{ formattedName, phoneCount }]     // minimal; see D6
reactions?: { client?: emoji }                  // set on the *target* message
```
- **Existing items** (`type: 'text'`, no `media`) still validate. Every new field is optional. No migration is needed.
- **Linked list:** media messages append exactly like text, through `appendMessage`. Later updates to `media.*` use `UpdateItem` on the message only, never on the head.
- **Reactions** don't append to the list. They update the target message (found through `byWaMessageId`) and **don't** move the head. Whether a reaction should refresh `lastClientMessageAt` is open (D5).
- `append.js` copies `media` / `location` / `contacts` when present. `MessageSchema` gets nested Zod objects. `apps/web/lib/constants.js` mirrors the type list and limits.
- **Outbound status:** `status` keeps its meaning (`pending → sent → delivered → read`, or `failed`). The upload to Meta happens inside the sender before `sent`, so there's no new delivery status. Add `played` (rank 4) later, for voice notes only, or ignore it (default: ignore in F2, D8).

### 4.3 Architecture
```
INBOUND
Meta ──POST──▶ webhook λ (10 s) ──append msg {type:image, media.state:pending, text:"[Photo] caption"}──▶ DynamoDB
                    └──SendMessage {messageId, waMediaId}──▶ SQS media-fetch (standard) + DLQ
                                                                   │
                         media-fetch λ (1024 MB, 120 s) ◀──────────┘
                           GET /{media-id} → url → GET url (bearer) ──stream──▶ S3 in/<messageId>
                           check size/sha256 → UpdateItem media.{state:ready, s3Key, size}
                                     (GuardDuty scans on PutObject → tag)
UI ──GET /api/chats/:phone/messages/:id/media──▶ Next.js (assertCanView, state ready, scan clean)
                           ──302 presigned GET (≤ 300 s, Cache-Control: no-store)──▶ S3

OUTBOUND
UI ──POST /api/chats/:phone/uploads {mimeType,size,filename}──▶ Next.js (assertCanSend, window, limits)
   ◀── presigned POST (out/<ulid>, content-length-range, Content-Type, 5 min)
UI ──multipart POST file──▶ S3 (progress via XHR)
UI ──POST /api/chats/:phone/messages {type, uploadId, caption}──▶ Next.js: HeadObject (size/type) → append pending → SQS FIFO (unchanged contract)
sender λ: getMessage → if media and no waMediaId: GetObject → POST /{phone-number-id}/media → save waMediaId
          → POST /messages {type, <type>:{id, caption, filename}} → setWaMessageId (sent)
```
**Why async fetch (recommended) rather than downloading in the webhook:** a download of up to 100 MB can't reliably finish inside the 10 s webhook timeout. A slow or failed download would also make Meta retry the whole batch, and later messages in that batch would wait behind it. Writing the message first keeps the chat order and makes the agent see "Photo loading…" at once. The 7-day media ID lifetime leaves plenty of time for SQS retries.
- **media-fetch queue:** a standard queue (order doesn't matter, because the message is already linked), `maxReceiveCount: 5`, DLQ. On the last attempt the Lambda sets `media.state = failed`. Visibility timeout ≥ 6 × the Lambda timeout.
- **Streaming:** use `@aws-sdk/lib-storage` `Upload` with the fetch body stream. This avoids buffering 100 MB and keeps memory flat. Verify the MIME from `GET /{media-id}` against an allowlist before storing.
- **Webhook `errors[]` 131052:** store `type` from the payload, `media.state: 'too_large'`, and text "[File too large to receive]".
- **Sender:** a 100 MB document upload to Meta needs more than 30 s and 256 MB. Raise the sender to 1024 MB and 120 s (visibility 720 s), or cap outbound documents (D3).

### 4.4 API (Next.js)
| Route | Purpose |
|---|---|
| `POST /api/chats/[phone]/uploads` | Validates type and size against the per-kind limits; returns a presigned **POST**. A presigned PUT can't enforce `content-length-range`. |
| `POST /api/chats/[phone]/messages` | The body becomes `{ text }` **or** `{ type, uploadId, caption? }`. Checks `HeadObject` and that the key matches `out/<uploadId>`, then appends and enqueues as today. |
| `GET /api/chats/[phone]/messages/[messageId]/media` | `assertCanView`, `message.chatId === chatId`, `state === 'ready'`; then a `302` to a presigned GET. Documents use `ResponseContentDisposition: attachment` (images, audio and video are served inline). Returns `409 MEDIA_PENDING` / `410 MEDIA_EXPIRED`. |

Because of the redirect, `<img src>`, `<audio src>` and `<video src>` work with the existing cookie auth, and the client never stores S3 URLs.

### 4.5 UI
- **Bubbles by type:** image/sticker as `<img>` (lazy, max-width, click opens full size, `alt` = caption or "Photo from client"); audio as `<audio controls>` with a "Voice note" label when `voice`; video as `<video controls preload="metadata">`; document as a file card (icon, filename, size, Download); location as name/address plus an "Open in map" link to `https://www.google.com/maps?q=<lat>,<lng>`, with no embedded map (no API key, no third-party load on render); contacts as "Contact: <name> (+n numbers)"; reaction as an emoji badge on the target bubble.
- **States:** pending shows a skeleton with "Loading media…" (polling refreshes it); failed/expired show "Media unavailable. Ask the client to resend."; too_large shows its own text.
- **Composer:** a paperclip button opens a file picker with `accept` set to the allowlist. A preview chip (thumbnail or filename and size) has a caption field (max 1024), an upload progress bar (XHR `upload.onprogress`) and Cancel. Size and type errors are checked before the upload. Disabled when the window is closed, as today. Optimistic bubble: "Uploading… n%", then "Sending…".
- **Accessibility:** labelled attach button, keyboard-operable preview and remove, `aria-live` for upload progress and errors, `alt` text on images, native media controls.

### 4.6 Infrastructure and IAM (`services/whatsapp/serverless.yml`)
- **Bucket `vartalap-<stage>-media`:** Block Public Access (all four), BucketOwnerEnforced, **SSE-S3** by default (SSE-KMS optional, D7), a bucket policy that denies non-TLS requests, versioning off.
  - Lifecycle: abort incomplete multipart uploads after 1 day; expire unused `out/` uploads after 1 day (tag them `pending`, clear the tag on send); expire `in/` and `out/` after the retention period (D4).
  - CORS for `POST` from the web origin(s) only.
- **New SSM config:** `/vartalap/<stage>/config/MEDIA_BUCKET`.
- **New:** the `mediaFetch` Lambda, the `MediaFetchQueue` and its DLQ, and `/config/MEDIA_FETCH_QUEUE_URL` if the webhook gets it from SSM.

| Role | Added permissions |
|---|---|
| webhook | `sqs:SendMessage` on MediaFetchQueue; `dynamodb:Query` on `byWaMessageId` (already granted; used for reactions) |
| mediaFetch (new) | `ssm:GetParameters` on WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID; `s3:PutObject` on `media/in/*`; `dynamodb:GetItem` and `UpdateItem` on Messages; SQS consume (auto) |
| sender | `s3:GetObject` on `media/out/*` |
| web app (assumed role locally) | `s3:PutObject` (to sign POSTs), `s3:GetObject`, `s3:GetObjectTagging` (scan status), `s3:HeadObject` (via GetObject) on the bucket. A presigned URL stops working when the signing session's credentials expire, even if its own expiry is later. |

### 4.7 Security and privacy
- **Media is PII** (IDs, tickets, faces, voices, locations). Only users who pass `assertCanView` get a URL. URLs are short-lived (≤ 300 s), use `no-store`, and are never persisted. When a chat is reassigned, the previous agent loses access at the next request.
- **No media data in logs:** log `messageId`, `waMediaId`, mime, size and state. Never log captions, filenames, Meta media URLs (they carry a token), presigned URLs, location coordinates or contact cards. S3 keys contain no phone numbers.
- **Unsafe content:** never serve `text/html`, `image/svg+xml` or unknown types inline. Documents are served as attachments. Allowlist MIME types on both sides, and verify the type with a magic-byte sniff in mediaFetch (D9).
- **Malware:** enable GuardDuty Malware Protection for S3 on the bucket, and block downloads until the tag is `NO_THREATS_FOUND` (D2).
- **Retention (GDPR, PDPA, PDPL):** S3 lifecycle expiry plus `media.state = expired` in the UI. Client-deletion requests must also delete `in/` and `out/` objects. This ties into the deferred retention work in the PRD; **flag it before going beyond the trial.** Bucket region = stack region (`ap-south-1`); data residency for Saudi PDPL is **not assessed** (route to InfoSec/Legal).

## 5. Affected modules and files
- **M2 core:** `packages/core/src/schemas/message.js` (enum, nested schemas), `messages/append.js` (copy the new fields), new `messages/media.js` (`setMediaState`, `setClientReaction`), core `config.js` (bucket name), `schemas/api.js` (send body, upload body).
- **M5 webhook:** `src/whatsapp/parse.js` (per-type mapping, `errors[]`, reactions), `src/handlers/webhook.js` (enqueue the fetch, apply reactions).
- **New:** `src/handlers/media-fetch.js`, `src/whatsapp/media.js` (resolve, download, upload).
- **M6 sender:** `src/whatsapp/client.js` (`uploadMedia`, `sendMedia`; 131053 is final), `src/handlers/sender.js`.
- **M1 infra:** `serverless.yml` (bucket, queue, Lambda, IAM, SSM, GuardDuty plan resource).
- **M7 API:** `apps/web/app/api/chats/[phone]/messages/route.js`, new `uploads/route.js` and `messages/[messageId]/media/route.js`, `apps/web/lib/api.js`.
- **M8 UI:** `components/Conversation.js` (a `MessageBody` per type), `components/Composer.js` (attach, preview, progress), `lib/client-api.js`, `lib/constants.js`, `globals.css`.
- **New dependencies:** `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/s3-request-presigner`, `@aws-sdk/lib-storage`.
- **Docs:** update the M5 Known limitations section.

## 6. Open decisions (recommended default in **bold**)
| # | Question | Default |
|---|---|---|
| D1 | Download inbound media inside the webhook, or asynchronously? | **Async via SQS + mediaFetch** |
| D2 | Malware scanning in Phase 1? | **Yes, GuardDuty for S3; block until clean** (low cost at trial volume) |
| D3 | Outbound document cap | **16 MB in P2** (sender stays small); raise to 100 MB later with a bigger sender |
| D4 | Media retention | **90 days**, then expire (the message text stays). Product owner and InfoSec to confirm against GDPR/PDPA/PDPL. |
| D5 | Do reactions refresh the 24-hour window or the chat list order? | **No.** Badge only; verify Meta's window semantics |
| D6 | Store shared contact cards in full? | **No.** Name plus phone count; show "ask client" if more is needed (third-party PII) |
| D7 | SSE-S3 or SSE-KMS (customer-managed key) | **SSE-S3 for the trial**; KMS if ISO 27001 key control requires it |
| D8 | Track the voice-note `played` status | **Ignore in F2** (parse skips it quietly, not as a warning) |
| D9 | Magic-byte sniffing of inbound files | **Yes, with a small pure-JS sniff on the first bytes** |
| D10 | Thumbnails or image resizing | **No.** Lazy-load originals (≤ 5 MB) |

## 7. Risks
- **Video-note behavior is undocumented.** It may arrive as `unsupported` and leave a gap for clients who use it heavily.
- **Duplicate outbound sends (M6 open issue)** get costlier with media. Caching `waMediaId` avoids a second upload, but not a second send.
- **Browser voice recording:** Chrome and Safari record webm or mp4, not ogg/opus, so sending voice notes needs server-side transcoding (ffmpeg layer). That's why it is deferred to P4.
- **Meta MIME strictness (131053) and H.264 profiles:** agent-uploaded videos may be rejected. Show the error code in the UI.
- **Presigned URLs** signed with short-lived local `assume` credentials can expire early. This is acceptable for the trial.
- **Cost growth** from large documents over long retention. Bound it with lifecycle rules.
- **The webhook `url` field rollout** varies by account. The design doesn't depend on it.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| P1 Inbound | Schema; parse all types; reactions; bucket, queue and mediaFetch; GuardDuty; media GET route; UI bubbles for image, sticker, audio/voice, document, location, contacts, button/interactive; pending/failed states | **L** |
| P2 Outbound | Upload route (presigned POST), attach UI with progress, send body, sender upload plus `sendMedia` for image, document, audio file | **M** |
| P3 Video | Inbound and outbound video (16 MB); video-note test on `dev` and the resulting handling; profile and MIME error UX | **S** |
| P4 Hardening | Retention job and client-data deletion hook, voice-note recording with transcoding, optional `played` status, larger outbound documents | **M** |

**Cost assumptions (estimates, not quotes):** 2,000 inbound plus 500 outbound files a month at about 1 MB average gives about 2.5 GB/month, or about 7.5 GB stored at 90-day retention. S3 storage and requests come to under USD 1/month. GuardDuty is about USD 0.23 (GB) plus USD 0.54 (objects), so about USD 0.8/month before the free tier. Lambda and SQS costs are negligible. Meta charges nothing extra for media within the service window. Total: about **USD 2/month**, using us-east-1 list prices; ap-south-1 is unverified.

## 9. Acceptance criteria
- [ ] An inbound photo, PDF, voice note, audio file and sticker each appear in the conversation within about 10 s, render or play inline (the PDF downloads), and survive a webhook replay without duplicates.
- [ ] The webhook still returns 200 within its timeout when a payload contains a 50 MB document. The file arrives later through mediaFetch.
- [ ] An inbound file over 100 MB (131052) shows "File too large to receive". A forced fetch failure shows "Media unavailable" after the retries.
- [ ] Location shows name/address and an "Open in map" link. Contacts show only the name and phone count. A reaction shows as a badge on the right outbound message and doesn't change the chat head.
- [ ] Existing text-only chats render unchanged. Old items without `type` media fields still pass `MessageSchema`.
- [ ] The media URL route returns 403 to an agent who isn't assigned (including right after a reassignment), and the URL it issues expires within 300 s.
- [ ] The S3 bucket rejects public and non-TLS access. Objects are encrypted. No log line contains a caption, filename, media URL or full phone number.
- [ ] An agent can attach and send a JPEG (≤ 5 MB), a PDF and an MP3 with a caption. Status moves `pending → sent → delivered → read`. A 6 MB JPEG is rejected before the upload.
- [ ] Attach is disabled when the 24-hour window has expired, and the API rejects a media send with `WINDOW_EXPIRED`.
- [ ] A file GuardDuty flags as malicious can't be downloaded from the UI.
- [ ] (P3) The test result for a video note is recorded in this note, and the UI handles that case.

## 10. Implementation notes (2026-10-17)

Built against F3's opaque IDs: inbound `messageId` is a ULID, routes live under `/api/chats/[id]/…`, and every message leaves the API through `toMessageView`, which now also calls F2's `stripMediaInternals` (drops `media.waMediaId`, `media.s3Key`, `media.sha256`). S3 keys are `in/<messageId>` and `out/<messageId>`. No phone number, wamid or Meta media ID is in any key, URL, queue body or response. Nothing has been deployed, run against AWS or tested live.

### Decisions taken (recommended defaults)
| # | Taken |
|---|---|
| D1 | Async fetch: webhook → `MediaFetchQueue` (standard, 5 receives, DLQ) → `mediaFetch` Lambda (1024 MB, 120 s). |
| D2 | GuardDuty Malware Protection for S3 on `in/` and `out/`, tagging on. Downloads and outbound sends wait for `NO_THREATS_FOUND`. `MEDIA_SCAN_REQUIRED=false` (serverless param `mediaScanRequired`) turns the check off if the feature is unavailable. |
| D3 | Outbound documents capped at 16 MB. Sender raised to 512 MB / 90 s (visibility 540 s) for the scan wait + upload. |
| D4 | 90-day retention by S3 lifecycle (`expire-media`). A missing object is marked `media.state = 'expired'` lazily by the media route. |
| D5 | Reactions update only the target message (`reactions.client`). No chat head, window or list-order change. |
| D6 | Contact cards store `formattedName` + `phoneCount` only. |
| D7 | SSE-S3. |
| D8 | `played` status ignored quietly in `parse.js`. |
| D9 | Magic-byte sniff (`packages/core/src/media/sniff.js`) on inbound files (mediaFetch) and outbound files (sender). Executables, HTML/SVG/XML content are always rejected. |
| D10 | No thumbnails. Originals load lazily. |

### Other design choices and assumptions
- **`text` stays the summary** (`[Photo] caption`, `[Voice note]`, `[Document] name.pdf`). The caption is also stored as `media.caption` so the UI can show it under the media. `lastMessagePreview` needs no change.
- **uploadId = messageId.** The uploads route issues a ULID. The send route uses it as the message ID, so the file's key is `out/<messageId>` and a repeated send of one upload is rejected (`409 CONFLICT`). The presigned POST binds the exact size, Content-Type and `x-amz-meta-uploader` (user ID). The send route checks all three with HeadObject.
- **Scan gating is in the app, not the bucket policy.** The bucket policy denies `GetObject` only for `THREATS_FOUND` objects, because the web app must HeadObject an upload before its scan finishes. The media route and sender treat a missing tag as "scanning" and `UNSUPPORTED`/`FAILED`/`ACCESS_DENIED` as blocked.
- **Failed media enqueue:** the webhook returns 500 so Meta redelivers. The duplicate delivery looks the message up by wamid and re-queues the fetch while it's still `pending`.
- **Inbound Content-Type:** stored as the base MIME when it is on the kind's allowlist (or inline-safe audio/video/image), otherwise `application/octet-stream`. Documents are always served as attachments.
- **Meta `sha256`:** its encoding (hex or base64) isn't documented. A mismatch is logged (`media.sha256_mismatch`), not rejected. Tighten after checking on `dev`.
- **New error codes:** `MEDIA_PENDING` (409), `MEDIA_UNAVAILABLE` (410).
- **Video (P3):** the inbound and outbound paths are the same as other media (MP4/3GPP, 16 MB). A failed send with 131053 shows "WhatsApp rejected the file format. For video use MP4 (H.264 + AAC)".
- **Video notes:** default handling only. If one arrives as `video`, it renders as a normal video. If it arrives as `unsupported` with a type containing `video_note`/`round_video`/`ptv`, the bubble reads "Video note: not supported by the WhatsApp Cloud API. Ask the client to send it as a video." Any other unsupported type reads `[Unsupported message: <type>]`.
- **Scan wait in the UI:** a media element that fails to load (409 while scanning) is retried every 5 s, up to 6 times, then shows "Media unavailable" with a Retry button.

### Files
- Core: `packages/core/src/media/{constants,sniff,summary,config,index}.js`, `schemas/media.js`, `messages/media.js` (new). Changed: `schemas/message.js`, `schemas/api.js`, `messages/append.js`, `messages/view.js`, `messages/index.js`, `index.js`, `errors.js`, `config-loader.js`.
- Service: `src/handlers/media-fetch.js`, `src/whatsapp/media.js`, `src/whatsapp/send-media.js`, `src/lib/s3.js`, `src/lib/media-queue.js` (new). Changed: `src/whatsapp/parse.js`, `src/whatsapp/client.js`, `src/handlers/webhook.js`, `src/handlers/sender.js`, `serverless.yml`, `README.md`, `package.json`.
- Web: `app/api/chats/[id]/uploads/route.js`, `app/api/chats/[id]/messages/[messageId]/media/route.js`, `lib/media.js`, `components/MessageBody.js` (new). Changed: `app/api/chats/[id]/messages/route.js`, `lib/client-api.js`, `lib/constants.js`, `components/Conversation.js`, `components/Composer.js`, `app/globals.css`, `package.json`.
- Scripts: `scripts/delete-client-media.js` (new; never run), `scripts/package.json`.
- New dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/s3-request-presigner`, `ulid` (web), `@aws-sdk/client-s3`, `@aws-sdk/client-sqs`, `@aws-sdk/lib-storage` (service), `@aws-sdk/client-s3` (scripts).

### Deferred
- **Voice-note recording** in the browser (needs ogg/opus transcoding, e.g. an ffmpeg layer). Agents can send audio files.
- **Outbound documents over 16 MB** (needs a bigger sender or a streaming upload to Meta).
- **`played` status** for voice notes.
- **Orphan uploads** (uploaded, never sent) are not tagged for 1-day expiry. Tagging would race GuardDuty's own tag write (PutObjectTagging replaces the whole tag set). They expire under the 90-day rule. A cleanup job can be added later.
- **Automatic client-data deletion:** `scripts/delete-client-media.js` is a manual hook. It deletes a chat's files and marks them `expired`. A full client-deletion flow (messages, chat, notes) is still the PRD's deferred retention work.
- **Saudi PDPL data residency** for the bucket (`ap-south-1`) is not assessed. Route it to InfoSec/Legal before going beyond the trial.
- **Seeking in long videos** after the 300 s presigned link expires needs a reload of the bubble.

### Deploy steps
1. **Review the GuardDuty role** (`MediaMalwareProtectionRole` in `serverless.yml`) against the current AWS docs for Malware Protection for S3. It was written from memory and is **unverified**. The deploying role also needs `iam:PassRole` on it and `guardduty:CreateMalwareProtectionPlan`, plus S3 bucket and policy permissions.
2. Set the serverless params if the defaults don't fit: `mediaWebOrigin` (the web app's origin for S3 CORS, default `http://localhost:3000`) and `mediaScanRequired` (`'true'`).
3. Deploy the stack (it bundles core into every Lambda, so the webhook, sender and mediaFetch all update). F2 adds no DynamoDB GSI. If F3's `byPublicId` GSI is being created in the same deploy, that is fine, because F2 adds none.
4. New SSM parameters (created by CloudFormation, no manual value needed): `/vartalap/<stage>/config/MEDIA_BUCKET` and `/vartalap/<stage>/config/MEDIA_SCAN_REQUIRED`. Both are optional for the web app. Without them, media routes return 500 "Media storage is not configured" and everything else works.
5. Add the `VartalapMediaF2` statement to the web app's role (see `services/whatsapp/README.md`). Restart the web app so it loads the new config keys.
6. Run `npm install` at the repo root (lockfile already updated).
7. **Verify on `dev`:**
   - Send a photo, a PDF, a voice note, an audio file, a sticker, a location, a contact and a reaction from a test phone. Check the acceptance criteria in §9.
   - **Video note:** send a round video note and record the observed webhook `type` here (`video` or `unsupported` + its `unsupported.type`). If it's `unsupported` with a different type name, add that name to `unsupportedSummary` in `packages/core/src/media/summary.js`.
   - Check how Meta encodes `sha256` in `GET /{media-id}` (hex or base64). If it reliably matches, make a mismatch fail the fetch in `media-fetch.js`.
   - Check that GuardDuty tags objects within a few seconds (sender waits ≤ 15 s, then retries through SQS).
   - Send a JPEG, a PDF, an MP3 and an MP4 from the UI. Try a 6 MB JPEG (rejected before upload) and a non-H.264 video (expect 131053 and the hint).

