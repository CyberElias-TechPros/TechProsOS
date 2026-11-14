# Production readiness implementation — 2026-11-14

## Audit result
The existing application is a broad, usable **fictional browser demo**, not a production service. Its business checks and identities run in localStorage; there is no API/database, verified sign-in, recipient invitation acceptance, durable delivery, payment verification, or scheduler. Existing green tests do not establish those properties.

## Ordered work
1. Reproduce security/workflow defects with regression tests; record threat model and acceptance criteria.
2. Establish one server-enforced command contract and transactional domain reducer. Keep the demo adapter explicitly separate.
3. Add PostgreSQL schema/migrations, opaque HttpOnly sessions, verified email/password reset, MFA, recipient invitations, explicit expiring MSP delegation, least-privilege projections, append-only audit and optimistic concurrency.
4. Connect the existing modules to authenticated commands; fix ticket, procurement, maintenance, project, finance, document and reporting flows. Add missing create/edit/receive/payment/access controls.
5. Add durable outbox/email, idempotent scheduled jobs, signed monitoring ingestion, verified Paystack checkout/webhooks, attachments and privacy/export controls.
6. Add live-mode loading/error/setup states, accessible dialogs, responsive/keyboard checks, privacy/help documentation and deployment configuration.
7. Run unit + real PostgreSQL-engine integration tests, typecheck, production build/budget, dependency audit and runtime smoke checks. Publish an honest release gate: external infrastructure and credentials are not invented or represented as tested.

## Non-negotiable boundaries
- Live mode never falls back to localStorage or demo identities when the API/database is unavailable.
- Browser-supplied user/tenant/role IDs are never an authentication or authorization source.
- Every live mutation is authenticated, origin-checked, CSRF-checked, validated, tenant-scoped, version-checked, transactional and audited.
- Secrets remain server-only. GitHub/Vercel environment entries are documented; none are committed.
- Demo data is fictional and isolated. Production workspaces start empty.
- A passing build is not a claim of production certification, measured CWV, legal compliance, or tested third-party delivery.

---

## Implementation status (2026-11-14)

Completed in code on `arena/e319e8ac-techprosos`:
- Shared validated command/domain layer (`contracts.ts`, `operations.ts`) with timezone-aware SLA, integer-kobo finance, least-privilege projections, explicit demo/live/unconfigured store modes.
- PostgreSQL schema/migrations (`server/schema.ts`, `server/db.ts`) and framework-independent API (`server/api.ts`, `api/[...path].ts`).
- Live auth: registration + email verification, login, HttpOnly opaque sessions, CSRF, password reset, invitation acceptance, TOTP MFA + recovery codes, session revocation, account profile.
- Tenant-scoped command endpoint with revision conflicts, atomic persistence, append-only audit, transactional email outbox.
- Paystack checkout + signature-verified webhook settlement; invoice payment ledger; monitoring agent ingest with per-device tokens and dedupe; cron jobs for maintenance/SLA/reviews/report schedules.
- UI wired to async actions: auth/recovery/invitation pages, account security, admin SLA/privacy/schedules/delegations/integrations, device registration, payment recording, live polling.
- CI workflow, `.env.example`, deployment runbook, ADR-0004, bundle budget script.

Verification at implementation time:
- `npm run check` green: typecheck (app + server), 9 test files / 71 tests (including 14 PostgreSQL-engine API integration tests), production build, `npm audit --audit-level=moderate` = 0 vulnerabilities, initial JS ≈185 KB gzip (<300 KB).
- Local runtime smoke: Vite dev server + demo API returned `/`, `/api/config`, `/api/health` 200.

Still required outside the codebase before production certification:
- Provision PostgreSQL and set encrypted environment variables (`.env.example`).
- Run `npm run db:migrate` against the production database.
- Configure Resend sending domain and Paystack webhook/keys.
- Set up frequent external cron (or upgrade Vercel) for SLA responsiveness; Hobby cron is daily.
- Perform end-to-end verification with real credentials, backup/restore drill, and accessibility/browser runtime pass on target devices.
