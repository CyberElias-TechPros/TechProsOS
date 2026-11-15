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
