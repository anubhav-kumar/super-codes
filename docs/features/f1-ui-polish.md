# F1: Modern UI polish

**Status:** Built (P1–P3) · **Depends on:** M8 (web UI), M7 (API) · **Related:** F2 (media), F3 (hide phone), F4 (client attributes fill the details panel)

## 1. Goal
M8 shipped a UI that was meant to be "plain and usable, not polished" ([m8-web-ui.md](../modules/m8-web-ui.md)). Agents spend their whole shift in it, so F1 makes it look and feel like a current agent inbox: faster scanning of the chat list, clearer message states, consistent controls, an accessible baseline (WCAG 2.2 AA) and good phone behavior.

- **Who it's for:** agents (chat list + conversation all day) and admins (assignment, users).
- **Brand:** the product belongs to the client business, not Wego. Use neutral, product-owned styling ("Vartalap" wordmark, green accent kept as a WhatsApp-adjacent cue). No Wego branding.
- **Out of scope:** API or data changes. The two optional backend items in section 6 are separate decisions.

## 2. Current state
| Area | Today | File |
|---|---|---|
| Styling | One global stylesheet, light/dark tokens via `prefers-color-scheme`, about 20 color tokens, a single `--radius`, hard-coded px spacing and font sizes | `apps/web/app/globals.css` |
| Fonts / icons | System font stack, 15px/1.45. No icon set: text glyphs (`←`, `✓`, `✓✓`) | `globals.css`, `components/Conversation.js` |
| Dependencies | `next`, `react`, `react-dom`, `jose`, AWS SDK. No UI library | `apps/web/package.json` |
| Shell | Top bar with text nav (Chats / Users / Password), name, role badge, Log out | `components/AppShell.js` |
| Chat list | 2-pane grid (280–340px list + conversation). Admin tabs: Unassigned / All / Mine. Row = title, time, preview, assignee badge, "Window closed" badge. Text "Loading…" states. Polls every 5 s | `components/ChatList.js`, `app/(staff)/chats/layout.js` |
| Conversation | Header (title, phone, assign control), day dividers (ISO date), bubbles (in / out / admin colors), ticks as text, "Load older" button, inline Retry/Discard on failed sends. Polls every 3 s. No `role="log"` | `components/Conversation.js` |
| Composer | Textarea (2 rows) + Send. Enter sends, Shift+Enter newline. Closed-window banner | `components/Composer.js` |
| Assign | Native `<select>` + "Auto-assign" button, inline error | `components/AssignControl.js` |
| Users / Password | Card forms, table, inline success/error text | `app/(staff)/admin/users/page.js`, `app/(staff)/account/password/page.js` |
| Login | Centered card, wordmark, two fields | `app/login/page.js` |
| Formatting | 24-hour time, ISO dates, list shows time today else ISO date | `lib/format.js` |
| Mobile | ≤768px: one pane at a time, back link, name hidden | `globals.css` |

**Data available to the UI** (`ChatSummarySchema`, `packages/core/src/schemas/chat.js`): `chatId`, `clientName`, `lastMessageAt`, `lastClientMessageAt`, `lastMessagePreview`, `assignedTo`, `assignee`, `windowOpen`, `headMessageId`.

**Backend gaps that limit polish:**
- No unread count or last-read tracking (per user or per chat).
- No search or text filter on `GET /api/chats` (only `filter`).
- Preview has no direction. But `lastClientMessageAt === lastMessageAt` means the last message came from the client (both are set from the same `:at` in `buildChatUpdate`, `packages/core/src/messages/append.js`). That gives an **"Awaiting reply"** indicator with no backend change.

**Measured contrast of current tokens** (WCAG formula, computed locally):
| Pair | Ratio | Verdict (AA) |
|---|---|---|
| White on `--accent` #128c5e (primary button, 15px) | 4.25 | Fails 4.5:1 for normal text |
| `--accent` on surface (active tab 13px, link button 12px) | 4.25 | Fails |
| Dark: `--muted` on `--bubble-out` (message time 11px) | 4.20 | Fails |
| `--border` on surface (input outline) | 1.30 | Fails 3:1 non-text contrast (1.4.11) |
| `--muted` on surface / surface-2 / bubble-out (light) | 5.55 / 4.88 / 4.84 | Passes |
| `--read` tick on `--bubble-out` (light) | 3.72 | Passes as an icon (3:1), fails if treated as text |

## 3. Research findings
**Agent-inbox patterns**
- **3-pane layout:** Zendesk Agent Workspace puts a customer context panel on the right of the conversation, resizable, and its width persists across tickets ([Zendesk: Using the context panel](https://support.zendesk.com/hc/en-us/articles/4408836526362-Using-the-context-panel)). The thread runs oldest to newest, newest at the bottom (same source). A third-party article describes the same queue / conversation / context layout ([Macha blog](https://www.getmacha.com/blog/zendesk-agent-workspace-explained), secondary source).
- **Keyboard:** Intercom's inbox uses J/K for previous/next conversation, Cmd/Ctrl+K for a command menu and a shortcut cheat sheet, and shortcuts only work outside the composer ([Intercom: Command-K in the inbox](https://www.intercom.com/help/en/articles/6272267-how-to-use-command-k-in-the-inbox)).
- **WhatsApp Web** uses Ctrl+Alt (Cmd+Ctrl on Mac) combos for search and next/previous chat. Exact keys differ between unofficial sources and there is no official list (**unverified**: [WABetaInfo](https://wabetainfo.com/all-shortcuts-available-on-whatsapp-web/), [XDA](https://www.xda-developers.com/whatsapp-keyboard-shortcuts/), [Hongkiat](https://hongkiat.com/blog/keyboard-shortcuts-whatsapp)). Takeaway: don't copy its keys. Use simple, documented single-key shortcuts like Intercom.
- **Common conventions** (general industry practice, **unverified** against a single source): avatars with initials and a stable per-contact color, bold title plus a dot/count for unread, relative times ("2m", "Yesterday"), skeleton rows while loading, toasts for transient results, an illustrated or icon empty state, search pinned at the top of the list.

**Styling options** (constraints: JavaScript only, Next 16, React 19, small bundle)
| Option | Fit | Notes |
|---|---|---|
| **Plain global CSS + tokens (today), organised with `@layer`** | Best | Zero new deps. Every class name already exists. Next supports global CSS but warns that global styles are not removed between routes, so prefer scoped CSS for page-specific rules ([Next.js CSS docs](https://nextjs.org/docs/app/getting-started/css)) |
| CSS Modules for new components | Good | Built into Next, scoped class names, works in `.js` files (same source). M8 already allows it |
| Tailwind v4 | Possible | Next's docs recommend it for most styling (same source). But every `className` in 10+ files gets rewritten and a PostCSS build step is added. Large diff for a polish pass |
| shadcn/ui | Poor | JS output is supported via `"tsx": false` in `components.json`, but the docs still recommend TypeScript and it requires Tailwind ([shadcn JavaScript](https://ui.shadcn.com/docs/javascript), [manual install](https://ui.shadcn.com/docs/installation/manual)) |
| Radix primitives / Mantine | Not needed now | Only worth it for a combobox or menu. Mantine brings its own styling system. React 19 compatibility not checked (**unverified**) |

**Accessibility**
- Contrast: 4.5:1 for normal text, 3:1 for large text (18pt, or 14pt bold, about 24px / 18.5px) ([WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). UI component boundaries and icons need 3:1 ([SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- Focus must not be fully hidden by sticky content such as headers and toasts ([SC 2.4.11, AA](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)). Pointer targets are at least 24×24 CSS px ([SC 2.5.8, AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- Chat transcript: `role="log"` has implicit `aria-live="polite"`, needs an accessible name, and new items must be appended at the end ([MDN: log role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role)). Caveat: "Load older" prepends, so the log wrapper should hold only the live list and older pages should not be announced (test with a screen reader).
- Reduced motion: honor `prefers-reduced-motion` for skeleton shimmer, toasts and smooth scroll ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).

**Typography and icons**
- `next/font` self-hosts Google or local fonts, so the browser makes no request to Google and there is no layout shift. Variable fonts are recommended ([Next.js fonts](https://nextjs.org/docs/app/getting-started/fonts)).
- `lucide-react`: tree-shaken per icon ([lucide-react](https://lucide.dev/guide/packages/lucide-react)). Icons get `aria-hidden="true"` by default. Label icon-only buttons with visually hidden text on the button ([Lucide accessibility](https://lucide.dev/guide/advanced/accessibility)).

## 4. Proposed design
### 4.1 Approach
Keep **plain CSS with design tokens** and add **one dependency: `lucide-react`**. Split `globals.css` into `@layer reset, tokens, base, components, utilities` (one file is fine at this size). Add CSS Modules only for new self-contained components if the file gets unwieldy. No Tailwind, no component library.

### 4.2 Design tokens (additions or changes to `:root`)
| Group | Tokens | Value (light → dark) |
|---|---|---|
| Accent (contrast fix) | `--accent`, `--accent-strong` | #0e7a52 (5.35:1 with white) / #0b6b47 → dark unchanged (#25b37d with dark text, 7.05:1) |
| Control border | `--border-strong` (inputs, selects) | #8a958f (3.10:1) → #728379 (4.23:1 on surface) |
| Dark meta text | `--muted` on bubbles | Use a separate `--bubble-meta` #b0bdb6 on #12442f (5.70:1) |
| Read tick | `--read` | #1663c7 (5.02:1 on bubble-out) → #6fb2ff |
| Status | `--info`, `--info-bg`; keep `--danger`, `--success`, `--warn-*` | Pick ≥ 4.5:1 text pairs, verify |
| Avatar palette | `--avatar-1` … `--avatar-8` | 8 muted hues, white initials at ≥ 4.5:1, verify each |
| Spacing (4px base) | `--space-1`…`--space-8` | 4, 8, 12, 16, 20, 24, 32, 40 px |
| Radius | `--radius-sm` / `--radius` / `--radius-lg` / `--radius-full` | 6 / 10 / 14 / 999 px |
| Type scale | `--text-xs` / `sm` / `base` / `lg` / `xl` / `2xl` | 12 / 13 / 15 / 17 / 20 / 24 px. Minimum 12px (today's 11px message meta goes to 12px) |
| Weights | `--weight-regular` / `medium` / `semibold` / `bold` | 400 / 500 / 600 / 700 |
| Elevation | `--shadow-1` (cards), `--shadow-2` (popovers, toasts) | Softer in light, `none` plus border in dark |
| Motion | `--ease`, `--dur-fast` / `--dur` | 120 / 200 ms. Set to 0 under `prefers-reduced-motion` |
| Layout | `--topbar-h`, `--list-w`, `--details-w` | 56px, 360px, 320px |

Theme: keep the system-following theme. Optionally add a manual toggle (light / dark / system) with `data-theme` on `<html>`, stored in `localStorage` (see decision D4).

### 4.3 Component inventory
| Component | New or restyle | Notes |
|---|---|---|
| `Avatar` | New | Initials from `clientName` (fallback: a person icon, not the phone digits, which also helps F3). Color = hash(chatId) → `--avatar-n`. Sizes 32 / 40px |
| `Icon` usage | New | lucide icons: `Search`, `Send`, `ArrowLeft`, `Check`, `CheckCheck`, `Clock`, `AlertCircle`, `UserPlus`, `Users`, `KeyRound`, `LogOut`, `PanelRight`, `MessageSquare`, `Inbox` |
| `IconButton` | New | 36×36 (≥ 24px target), visually hidden label, tooltip via `title` |
| `Badge` / `StatusPill` | Restyle | Variants: neutral, warn ("Window closed"), info ("Awaiting reply"), assignee |
| `UnreadDot` | New | Phase 1: dot for "Awaiting reply" (derived). Phase 3: count badge if D5 is approved |
| `SearchBox` | New | Client-side filter over the loaded list (name, phone, preview). Clear button, `/` shortcut |
| `Skeleton` | New | List rows (avatar + 2 lines) × 8, conversation bubbles × 5. Shimmer off under reduced motion |
| `Toast` region | New | Small in-house component (no library). `role="status"` for success, `role="alert"` for errors. Bottom-center, auto-hides after 4 s, does not cover the composer's focus (2.4.11). Used for assign, auto-assign, user created, password changed, connection lost/restored |
| `EmptyState` | New | Icon, title, one line. "Select a chat", "No unassigned chats", "No matches", "No messages yet" |
| `DetailsPanel` | New (placeholder) | Right pane: avatar, name, assignment, window status with time left (from `lastClientMessageAt`), and a "Client details coming soon" slot that **F4** fills (description, notes, tags). Phone shown or masked per **F3** |
| `MessageBubble` | Restyle | Tail-less rounded bubbles, grouped consecutive messages (sender label on first only), time + lucide tick inside the bubble, admin bubbles marked with a "Sent by admin" label and color (not color alone) |
| `StatusTick` | Restyle | `Clock` = pending, `Check` = sent, `CheckCheck` = delivered, `CheckCheck` in `--read` = read, `AlertCircle` + text = failed. Each has visually hidden text ("Read") |
| `Composer` | Restyle | Auto-growing textarea (1–6 rows), icon Send button, character counter near the limit (4096), closed-window state with an info icon |
| `AssignControl` | Restyle | Keep the native `<select>` (accessible, no deps) styled with `--border-strong`. Auto-assign as a secondary button. Result via toast instead of inline text |
| `Button`, `Input`, `Field`, `Card`, `Table`, `Tabs` | Restyle | Tokenized sizes, visible `:focus-visible` ring (2px accent + 2px offset) on every interactive element, segmented-control tabs |

### 4.4 Page-by-page changes
| Page | Changes |
|---|---|
| Login | Centered card, neutral wordmark, show/hide password icon button, `autofocus` on email, spinner in the button, error with an icon and `role="alert"` |
| Shell | Slim top bar: wordmark, icon + label nav, user menu (avatar initials + name + role → Change password, Log out). On phones: icon-only nav |
| Chat list | Header: title + count, search box, admin segmented tabs. Row: avatar, name (bold when awaiting reply), relative time, one-line preview, badges (assignee for admins, "Window closed", "Awaiting reply" dot). 64–72px rows, active row with accent bar. Skeletons on first load and on tab switch. Empty states per filter |
| Conversation | Header: back (phone), avatar, name, subtitle (phone per F3, "Assigned to …"), assign control (admin), details-panel toggle. Sticky day dividers with "Today" / "Yesterday" / ISO date. `role="log"` with `aria-label="Messages"` around the live list. "Load older" as a subtle pill. Connection-problem banner replaced by a non-blocking toast plus a small header indicator. "Jump to latest" floating button when scrolled up and new messages arrive |
| Details panel | ≥ 1280px: third column, open by default. 769–1279px: overlay drawer from the right. ≤ 768px: full screen sheet opened from the header |
| Users (admin) | Add-user form in a card with 2-column grid; table with avatar + name, email, role pill, status pill; toast on create; skeleton rows while loading |
| Password | Same form styling, password visibility toggles, live rule hint (min 8 characters), toast plus inline success |

**Timestamps:** list shows `HH:mm` today, "Yesterday", weekday (e.g. "Mon") within 7 days, else ISO `YYYY-MM-DD`. Hover/`title` shows the full ISO date and 24-hour time. Keep the viewer's local timezone (as today).

**Keyboard shortcuts** (only when focus is outside inputs, like Intercom): `/` focus search, `J`/`K` next/previous chat, `Esc` close drawer or clear search, `?` shortcut help. In the composer: Enter sends, Shift+Enter new line (unchanged).

### 4.5 Responsive rules
| Width | Layout |
|---|---|
| ≤ 768px | One pane at a time (as today). Back icon, details as a full-screen sheet, 44px touch targets, composer pinned with `env(safe-area-inset-bottom)`, `100dvh` instead of `100vh` so mobile browser bars don't hide the composer |
| 769–1279px | List + conversation. Details as an overlay drawer |
| ≥ 1280px | 3 panes: list (360px), conversation (fluid), details (320px, collapsible, state remembered per browser) |

### 4.6 What NOT to change
- No API, schema, DynamoDB or Lambda changes in phases 1–2. Polling intervals (5 s / 3 s) and optimistic-send logic stay as they are.
- No change to role rules: agents never see admin-only controls.
- `lib/client-api.js`, `lib/use-polling.js`, `lib/constants.js` stay as they are. `lib/format.js` gets new helpers only.
- No core imports in the browser (M8 rule).

### 4.7 Security and privacy
- No PII in `localStorage`: only UI preferences (theme, panel open).
- Client-side search runs over data the user can already see. No new data exposure.
- Avatars use initials only (no profile photos fetched from WhatsApp).
- Coordinate with F3: the UI shows the phone in the header, list search and details panel. If F3 hides it, search must not match on phone either.

## 5. Affected modules and files
- **M8 web UI only:** `apps/web/app/globals.css`, `apps/web/app/layout.js` (theme attribute, optional font), `app/login/page.js`, `app/(staff)/chats/layout.js` (3 panes), `app/(staff)/chats/page.js`, `app/(staff)/admin/users/page.js`, `app/(staff)/account/password/page.js`.
- `components/AppShell.js`, `ChatList.js`, `Conversation.js`, `Composer.js`, `AssignControl.js`.
- New: `components/Avatar.js`, `IconButton.js`, `Skeleton.js`, `Toast.js` (provider + `useToast`), `EmptyState.js`, `SearchBox.js`, `DetailsPanel.js`, `lib/shortcuts.js` (or a hook), `lib/format.js` additions (`formatRelative`, `initials`).
- `apps/web/package.json`: add `lucide-react`.
- Optional (D5, separate approval): `packages/core` chat/user read state, `GET /api/chats` response, a new `POST /api/chats/:id/read`.

## 6. Open decisions
| # | Question | Recommended default |
|---|---|---|
| D1 | Styling approach | Keep plain CSS + tokens with `@layer`; CSS Modules allowed for new components. No Tailwind / shadcn |
| D2 | Font | System font stack (zero bytes, good Arabic and other non-Latin rendering from the OS). Alternative: Inter via `next/font` (self-hosted). Confirm the client's languages first |
| D3 | Icon set | `lucide-react` (tree-shaken, `aria-hidden` by default) |
| D4 | Manual theme toggle | Yes, light / dark / system in the user menu, stored in `localStorage` |
| D5 | Real unread counts | Not in F1. Ship the derived "Awaiting reply" dot first (no backend). If counts are wanted, scope a follow-up: per-user `lastReadMessageId` per chat + a mark-read call (M, backend) |
| D6 | Server-side search | Not in F1. Client-side filter over the loaded list. Revisit if a list exceeds about 200 chats |
| D7 | Brand accent | Keep a green accent (darkened for contrast) and the "Vartalap" wordmark. Ask whether the client wants their own logo/color (tokens make it a one-file change) |
| D8 | Details panel default | Open on ≥ 1280px, collapsible, remembered per browser |
| D9 | Keyboard shortcuts | Ship `/`, `J`/`K`, `Esc`, `?`. No Cmd+K menu in F1 |

## 7. Risks
- **Regressions in scroll behavior** (stick-to-bottom, "Load older" scroll preservation) when the message DOM changes. Keep the `listRef` logic untouched and test both paths.
- **Screen reader noise:** `role="log"` plus 3 s polling can re-announce if React re-mounts rows. Keep stable `key={messageId}` and test with VoiceOver/NVDA.
- **"Awaiting reply" ≠ unread:** it stays on until someone replies, even after an agent has read it. Label it clearly so it isn't read as "unread".
- **Scope creep** into F2/F4 (media bubbles, notes UI). The details panel is a placeholder only.
- **Contrast values** above were computed locally from hex values. Re-verify final tokens with a checker before release.
- **Bundle:** lucide is per-icon. Avoid `import * as Icons` or dynamic icon names.

## 8. Phased plan and effort
| Phase | Scope | Effort |
|---|---|---|
| P1 Foundation | Token overhaul (contrast fixes, spacing/type/radius scales), `@layer` structure, focus ring, reduced-motion, `lucide-react`, `IconButton`, `Avatar`, `Badge` variants, restyle buttons/inputs/cards/tables, `100dvh` | M |
| P2 Inbox polish | Chat list (avatars, relative time, "Awaiting reply", skeletons, empty states, search), conversation (bubbles, grouping, ticks, sticky days, `role="log"`, jump-to-latest), composer auto-grow, toasts, shell user menu, login/users/password restyle, keyboard shortcuts | L |
| P3 Details panel + theme | 3-pane layout, responsive drawer/sheet, placeholder content ready for F4, theme toggle | M |
| P4 (optional, separate approval) | Real unread counts / last-read tracking (backend + UI) | M |

## 9. Acceptance criteria
- [ ] All text pairs meet 4.5:1 (normal) or 3:1 (large), and control borders and icons meet 3:1, in light and dark mode (checked with a contrast tool).
- [ ] Every interactive element shows a visible focus ring, has a target ≥ 24×24px (≥ 44px on phones), and icon-only buttons have an accessible name.
- [ ] The message list has `role="log"` and an accessible name. A new inbound message is announced once by VoiceOver or NVDA.
- [ ] With `prefers-reduced-motion: reduce`, there is no shimmer, slide or smooth-scroll animation.
- [ ] The chat list shows avatar initials, relative time, an "Awaiting reply" marker when the last message is from the client, and skeletons (not "Loading…") on first load.
- [ ] Search filters the loaded list by name or preview (and phone unless F3 hides it), with a "No matches" empty state.
- [ ] Assign, auto-assign, user creation and password change confirm with a toast. Errors also stay accessible (`role="alert"`).
- [ ] Layout: 1 pane ≤ 768px, 2 panes 769–1279px with a details drawer, 3 panes ≥ 1280px. No horizontal scroll at 360px width. The composer stays visible with the mobile keyboard open.
- [ ] `/`, `J`, `K`, `Esc` work outside inputs and do nothing while typing in the composer.
- [ ] No API, schema or polling changes. Existing M8 "Done when" checks still pass. An agent never sees admin controls.
- [ ] The only new runtime dependency is `lucide-react`. No TypeScript files are added.

## Implementation notes (2026-10-17)
- **Decisions taken (defaults):**
  - D1: plain CSS with tokens in `@layer`;
  - D2: system font stack;
  - D3: `lucide-react` 1.59 (the only new dependency);
  - D4: light / dark / system toggle in the user menu, applied before first paint by a fixed boot script;
  - D5: "Awaiting reply" dot only, no unread counts;
  - D6: client-side search;
  - D7: the "Vartalap" wordmark, with an **aqua / sky-blue accent** (changed from green on 2026-10-17, at the product owner's request). Light accent `#0b6fa3`, dark `#38bdf8`, with a shallow-to-deep water gradient behind the chat. Every token pair was re-verified at AA;
  - D8: details panel open at 1280px and wider, remembered per browser;
  - D9: `/`, `J`/`K`, `Esc` and `?`.
- **Contrast:** every text pair in both themes, plus the control borders and the 8 avatar colours, was re-checked with the WCAG formula and passes AA. The light control border became `#7a8580` so it passes 3:1 on all light surfaces.
- **Visual check:** screenshots of the real build were taken locally with mocked `/api/*` data (made-up names, not committed):
  - desktop, light and dark;
  - tablet drawer;
  - phone list and chat;
  - login, users and the user menu.

  Two layout bugs were found and fixed this way: stretched form fields, and the phone header wrapping.
- **New files:**
  - `components/ui.js` (Avatar, IconButton, BrandMark, EmptyState, skeletons);
  - `Toast.js`, `DetailsPanel.js`, `ShortcutsDialog.js`, `PasswordInput.js`;
  - `lib/prefs.js`, `lib/use-shortcuts.js`.
- **Not done:**
  - P4 (real unread counts) and server-side search;
  - screen-reader testing of the `role="log"` region (VoiceOver/NVDA) is still a manual step.

