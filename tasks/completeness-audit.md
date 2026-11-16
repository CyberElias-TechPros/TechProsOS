# Completeness audit — 2026-11-15

Scope: find what is genuinely missing for every role to complete their real work, then
implement it. Verified against the code on `main` @ `6c223ed`, not from memory.
Baseline before this work: `npm run check` green, 14 files / 119 tests, 185.46 KB initial JS.

## Method

Rather than re-list the deferred infrastructure items (keys, DNS, agents), this pass traced
each user story through **contract → operation → UI → notification** and flagged where the
chain breaks. A feature that exists in one layer but not the others is worse than absent:
it looks supported and silently fails the user.

## Findings

### A. Broken chains (built in one layer, unreachable in another)

| # | Gap | Evidence | Impact |
|---|---|---|---|
| A1 | **Attachments have no UI at all** | `POST/GET /api/attachments` fully implemented (validation, 3MB/10 limits, audit, tenant scoping); `AttachmentMeta` in `types.ts`; `api.uploadAttachment` in the client. Zero references in any page. | Cannot attach a screenshot to a ticket, an invoice to a PO, or evidence to a finding. The single most common service-desk action is impossible. |
| A2 | **Plan seat limits never enforced on invite** | `PLANS[x].seats` read only in `Admin.tsx` display and on *downgrade* (`api.ts:166`). `user.invite` (`operations.ts:166`) has no seat check. | A 10-seat Starter tenant can invite unlimited users. Revenue leaks; the plan means nothing. |
| A3 | **Client-workspace limits never enforced** | `PLANS[x].clientWorkspaces` never read anywhere. `client.onboard` (`operations.ts:397`) has no count check. | MSP Launch (5 clients) can onboard unlimited clients. |
| A4 | **AI credits displayed but never consumed or enforced** | `aiAssistCredits` shown in `Assistant.tsx:50`, initialised to 500, never decremented. | The meter is decorative; no quota boundary exists. |
| A5 | **Invoices never become overdue** | `InvoiceStatus` includes `overdue`; `invoice.status` transitions list it as a source but nothing ever sets it. Scheduler has no invoice job. | Receivables ageing is wrong; no dunning; finance cannot chase payment. |

### B. Missing surfaces every user needs

| # | Gap | Impact |
|---|---|---|
| B1 | **No error boundary** | Any render error blanks the entire app with a white screen and no recovery. |
| B2 | **No 404 page** | Unknown URLs silently redirect to `/`, so a mistyped or stale link looks like a bug. |
| B3 | **No global search** | The palette searches only the last 60 tickets and some assets. Users cannot find a client, project, invoice, document or article by name. |
| B4 | **No offline detection** | On connectivity loss the user keeps editing and only discovers the failure on submit. |
| B5 | **No Terms/Privacy routes** | Signup consent (`Onboarding.tsx:76`) says "I agree to the terms of service and privacy notice" — neither document exists. NDPA requires an accessible notice. |

### C. Correctly deferred (not code gaps)

`PAYSTACK_SECRET_KEY`, monitoring agent binaries, subdomain tenancy, external high-frequency
cron, backup/restore drill. These need credentials, infrastructure or commercial decisions and
are tracked in `docs/GO-LIVE-CHECKLIST.md`. This pass does not pretend to solve them.

## Ordered implementation plan

Ordering follows dependency, not convenience: entitlements and money correctness first
(they guard revenue and are pure logic, so they are testable in isolation), then the
attachment chain (largest user-visible gap, needs the domain command before the UI), then
resilience surfaces, then legal.

1. **Entitlements** — one shared `entitlements.ts` computing seat/client/credit usage;
   enforce in `user.invite`, `client.onboard`, assistant use; surface in Admin. (A2, A3, A4)
2. **Receivables** — invoice ageing in the scheduler + overdue transition + dunning
   notifications, idempotent per invoice per day. (A5)
3. **Attachments** — `attachment.remove` command (owner/admin, audited), demo adapter parity,
   then a reusable `AttachmentPanel` wired into ticket, asset, PO and finding details. (A1)
4. **Resilience** — error boundary with recovery, real 404, offline banner. (B1, B2, B4)
5. **Findability** — global search across all record types, permission-scoped. (B3)
6. **Legal** — Terms and Privacy pages, linked from signup consent and marketing footer. (B5)

Each step: failing test first, then implementation, then `npm run check`.

## Boundaries (unchanged)

Tenant isolation and data-layer permission checks on every new path; audit on every mutation;
no secrets; no suppressions; demo stays fictional; live never falls back to localStorage.

---

## Implementation result — 2026-11-15

All six ordered steps are complete. Every item was reproduced with a failing test first.

| Step | Gap closed | Where |
|---|---|---|
| 1 | A2, A3, A4 — seats, client workspaces, assistant credits | `src/platform/entitlements.ts`; enforced in `operations.ts`; meters in Admin; Assistant meters and blocks |
| 2 | A5 — receivables ageing and dunning | `src/platform/receivables.ts`; scheduler job with per-invoice dedupe; ageing strip in Finance |
| 3 | A1 — attachments | `DELETE /api/attachments/:id`; `AttachmentPanel` on ticket, asset and document details |
| 4 | B1, B2, B4 — failure surfaces | `ErrorBoundary`, `NotFound`, `ConnectionBanner` |
| 5 | B3 — findability | `src/platform/search.ts`, wired into the command palette |
| 6 | B5 — legal | `/terms` and `/privacy`, public and linked from signup consent + footer |

### Defects found while implementing (not in the original audit)

- **The palette indexed the oldest tickets.** `slice(-60)` on a newest-first array meant a
  recently created ticket was unfindable. Fixed by the new index.
- **The palette bypassed ticket visibility.** It read `data.tickets` directly instead of
  `visibleTickets`, so an employee could surface colleagues' tickets through search that the
  queue correctly hid. Search now uses the same projection as the list screens.
- **Outstanding receivables double-counted part-payments.** Finance summed gross invoice net for
  `sent`/`overdue` and ignored `partial` entirely. It now uses the unpaid ledger balance.
- **Documents had no detail view**, so there was nowhere to hang per-document files. Rows now
  expand.

### Verification

`npm run check` green: typecheck (app + server), **20 files / 193 tests**, production build,
`npm audit --audit-level=moderate` = 0 vulnerabilities, initial JS **131.45 KB gzip** (budget 300 KB).
Runtime: dev server serves `/`, `/terms`, `/privacy`; the legal and search modules compile and load.

Test count went 119 → 193 (+74). No existing test was weakened or deleted.

### Still outside the codebase

Unchanged from `docs/GO-LIVE-CHECKLIST.md`: `PAYSTACK_SECRET_KEY` and webhook, monitoring agent
binaries, subdomain tenancy, high-frequency external cron, backup/restore drill, and a legal review
of the two notices before commercial launch. The notices describe implemented behaviour accurately;
they are not a substitute for counsel.

---

## Phase 2 — Sitewide UI overhaul (“Aurora Enterprise” v2) — 14 November 2026

**Ask:** the existing design was functional but not a showpiece; the user asked for a state-of-the-art,
professional, business-grade UI across every surface.

**Shipped** (design language documented in `docs/DESIGN-SYSTEM.md`):

- **Type system:** Space Grotesk Variable (display) + Inter Variable (UI), self-hosted via fontsource.
  Display face on headings, KPI numerals, prices, brand, stats. No JS-budget impact (CSS asset).
- **Token refresh:** aurora palette (indigo `#2e5bff` / cyan `#00a5c8` / violet `#7c5cff`), `--grad-brand`,
  `--grad-aurora`, layered shadows, glow tokens, spring easing. Dark theme re-tuned to match.
- **Ambient depth:** fixed aurora mesh + SVG grain on the app background; glass (blur/saturate) topbar,
  marketing nav, popovers, palette, dialogs; aurora hairline along card top edges.
- **Component polish sitewide:** gradient primary buttons with glow + shine sweep; refined secondary/ghost;
  focus-glow inputs; bordered soft badges; sticky-blur table headers with accent row hovers; KPI tiles with
  icon chips (Overview); toast/dialog spring entrances; empty-state gradient glyphs; kanban/NOC/chat/
  steps/timeline refinement. All via shared classes — every module inherits.
- **Shell:** deep-space sidebar with aurora glow + gradient active pill; workspace switcher now shows the
  plan tier (`plan-pill`); refined topbar search trigger.
- **Marketing:** new “alert → incident → knowledge” workflow band and a security/governance band (claims
  grounded: 16 roles — also fixed the previously wrong “13 roles” stat, tenant isolation, audit trail,
  NDPA); glass nav with active pills and a real mobile menu (the old burger button was a dead stub);
  professional multi-column footer with DELGRA LTD entity line; aurora-tinted hero palette.
- **Pricing:** monthly/annual toggle implementing the advertised “two months free on annual”
  (annual = 10× monthly, effective monthly = 10/12 rounded, billed-annually line shown); featured card
  gets a gradient border + glow.
- **Auth:** aurora aside (grid + glow orbs — the previously unstyled `hero-glow` class), persona buttons
  with user avatars.
- **Brand:** new favicon (aurora gradient T + status loupe), theme colours, `color-scheme` meta.
- **Docs/tests:** `docs/DESIGN-SYSTEM.md` added; landing audit extended (+3 tests: workflow/security bands,
  footer legal links + entity, nav menu button/links). 198 tests green.

**Verification:** `npm run check` green — typecheck, 20 files / **198 tests**, build (only the
pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` notice, present on main before this change), 0 vulnerabilities,
initial JS **131.49 KB gzip** (budget 300 KB).
