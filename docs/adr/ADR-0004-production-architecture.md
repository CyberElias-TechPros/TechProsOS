# ADR-0004 — Server-authoritative production architecture

## Status
Accepted (supersedes demo-only storage assumptions in earlier notes).

## Context
The original application was a polished React SPA whose business state lived in browser localStorage. That is suitable for a fictional demo but cannot provide real authentication, tenant isolation, concurrent editing, audit durability, payment verification, scheduled jobs, or recovery.

## Decision
1. **One domain contract.** `src/platform/contracts.ts` validates every command. `src/platform/operations.ts` is the shared transactional reducer used by both the demo adapter and the live PostgreSQL adapter. Identity, tenant and role are never accepted from command payloads.
2. **Live storage.** PostgreSQL tables store tenants, memberships, users, sessions, invitations, audit logs, counters, outbox, jobs, checkouts, payment events, device credentials and attachment blobs. Domain records use a tenant envelope (`tenant_id`, `id`, `kind`, JSONB) with natural-key unique indexes. Cross-document references are validated inside a tenant-locked transaction.
3. **Concurrency & idempotency.** Every workspace has a revision. Commands require the current revision; the server locks the tenant row, applies the reducer, persists diffs, audit and outbox atomically, then increments revision. Monitoring ingestion and scheduled jobs use dedupe keys. Payment webhooks are signature-verified and event-id deduplicated.
4. **Authentication.** Opaque HttpOnly session cookies (12h absolute, 30m idle), CSRF token header for mutations, scrypt password hashing, single-use email verification/reset/invitation tokens, TOTP MFA with encrypted secrets and hashed single-use recovery codes.
5. **Least privilege.** Server-side projections remove internal notes, other requesters' tickets, finance/admin data and audit logs from employee snapshots. MSP access requires explicit, expiring delegation intersected with the provider role.
6. **Money.** Integer-kobo helpers compute VAT/WHT and invoice balances from a payment ledger. Clients cannot set paid status. Paystack entitlements change only after server-side verification.
7. **Fail-safe modes.** `APP_MODE=demo` is explicitly fictional and local. Live mode never falls back to localStorage; missing configuration returns `503 SETUP_REQUIRED`.
8. **Operations.** Transactional outbox for email, cron endpoint for SLA/maintenance/review/report jobs, append-only audit trigger, rate limiting, attachment magic-byte validation, privacy export/erasure workflows.

## Consequences
- Production requires PostgreSQL and the environment variables in `.env.example`.
- Demo remains useful for evaluation but is not a security boundary.
- Horizontal scaling is possible because state, locks, jobs and sessions are server-side; attachment blobs currently live in PostgreSQL and should move to object storage at larger scale.
- Vercel Hobby cron frequency is limited; use an external scheduler or upgrade for frequent SLA checks.
