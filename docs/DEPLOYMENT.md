# Deployment & setup runbook

## 1. Provision infrastructure
- PostgreSQL 15+ (Aiven, Neon, Supabase, RDS, Cloud SQL, etc.). Require TLS (`sslmode=require` or `verify-full`).
  Providers that sign with a **private CA** (Aiven, some Supabase setups) also need `DATABASE_CA_CERT` — see §2a.
- Vercel project connected to this repository (framework: Vite; API routes in `api/`).
- Resend account with a verified sending domain.
- Paystack account (live or test keys) with webhook configured.

## 2. Configure environment variables
Add the variables from `.env.example` in Vercel Project Settings → Environment Variables (or GitHub encrypted secrets for CI). Do not commit values.

Required for live mode:
- `APP_MODE=live`
- `APP_URL=https://<your-canonical-origin>`
- `DATABASE_URL`
- `DATA_ENCRYPTION_KEY` (base64 of 32 random bytes)
- `CRON_SECRET` (≥32 random chars)

Optional database tuning:
- `DATABASE_CA_CERT` — private CA PEM, only for providers that need it (§2a).
- `DATABASE_POOL_MAX` — connections per serverless instance (default 3). Total connections
  ≈ this × concurrent instances. Aiven's entry tiers cap at **20**, so keep this at 2–3.

### 2a. Private-CA providers (Aiven)

Aiven for PostgreSQL signs its server certificate with a **per-project CA** that is not in
Node's trust store. Two driver behaviours combine to break a naive setup:

1. `pg` currently treats `sslmode=require` as `verify-full`, so it *does* verify the chain.
2. `pg` merges the parsed connection string **over** the options object, so an `sslmode` in
   the URL silently discards any `ssl: { ca }` you pass in code.

`server/db.ts` handles both: it strips `sslmode` from the URL and expresses the same intent as
an explicit `ssl` object, so the CA survives. You only need to supply the certificate:

1. Aiven Console → your service → **Connection information** → **CA certificate** → *Show* / *Download*.
2. Put the whole PEM in `DATABASE_CA_CERT` (Vercel accepts multiline values; escaped `\n`
   and base64 also work).
3. Keep `?sslmode=require` in `DATABASE_URL`.

Verification stays **on**. Never "fix" this with `rejectUnauthorized: false` — that removes
protection against machine-in-the-middle attacks on the database link. `sslmode=no-verify`
exists as an explicit escape hatch for local debugging only and must not be used in production.

The CA certificate is **not a secret** (it is a public certificate), but it is still kept in
environment config rather than the repo so it can be rotated with the service.

Required for email flows:
- `RESEND_API_KEY`
- `EMAIL_FROM`

Required for billing:
- `PAYSTACK_SECRET_KEY`

Generate secrets locally:
```bash
openssl rand -base64 32   # DATA_ENCRYPTION_KEY
openssl rand -hex 32      # CRON_SECRET
```

## 3. Apply database migrations
From a trusted machine/CI with `DATABASE_URL` set:
```bash
npm ci
npm run db:migrate
```
Migrations are forward-only and advisory-locked. The API also exposes `/api/ready` to verify migration state.

## 4. Deploy
Push to the production branch or deploy via Vercel. The SPA rewrite excludes `/api/*`. Security headers and CSP are in `vercel.json`.

## 5. Configure integrations
- Paystack webhook URL: `https://<origin>/api/webhooks/paystack` (event: `charge.success`). The server verifies the HMAC SHA-512 signature and re-verifies the transaction before applying entitlements.
- Monitoring agents: register a device in the UI, copy the one-time ingest token, then POST telemetry to `/api/integrations/monitoring` with headers `Authorization: Bearer <token>`, `X-Tenant-Id`, `X-Device-Id`, `X-Event-Id`.
- Scheduled jobs: `/api/cron/run` with `Authorization: Bearer <CRON_SECRET>`. `vercel.json` includes a daily cron compatible with Hobby. For production SLA responsiveness, call this endpoint every 1–5 minutes from an external scheduler or upgrade the Vercel plan.

## 6. Verify before go-live
```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
node scripts/check-bundle-budget.mjs
curl https://<origin>/api/health
curl https://<origin>/api/ready
```
Then manually verify: registration → email verification → login → MFA → invitation acceptance → tenant switch → ticket/asset/PO/invoice flows → Paystack test webhook → monitoring ingest → cron run → privacy export.

## 7. Operational boundaries
- Live mode never reads/writes business data in localStorage.
- Missing configuration fails closed with `503 SETUP_REQUIRED`.
- Audit logs are append-only at the database trigger level.
- Back up PostgreSQL regularly and test restore. Attachment blobs are stored in PostgreSQL (`attachment_blobs`); move to object storage when volume requires.
- Rotate `DATA_ENCRYPTION_KEY` only with a re-enrollment plan for MFA secrets.
