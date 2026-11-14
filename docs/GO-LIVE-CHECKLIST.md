# TechPros One — Go-Live Supply Checklist

Everything you must provide before the merged production build can serve real customers.
Verified against the code on `main` @ `9313b89` (not from memory).

**Current state:** production is deployed and READY, but the Vercel project has **zero environment
variables**, so every route renders the "Setup required" screen. Nothing below has been configured.

---

## 0. The three tiers

| Tier | What it unlocks | Items |
|---|---|---|
| **A — Boot** | App loads instead of "Setup required" | `APP_MODE`, `APP_URL`, `DATABASE_URL`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET` |
| **B — Sign-up** | People can register, verify, get invited, reset passwords | `RESEND_API_KEY`, `EMAIL_FROM` + verified sending domain |
| **C — Revenue** | Customers can pay for plans and invoices | `PAYSTACK_SECRET_KEY` + webhook + Paystack live activation |

Tier A alone gives you a working app that **nobody can create an account on** — registration
returns `503 EMAIL_NOT_CONFIGURED` (`server/auth.ts:72`). Plan for A + B together.

---

## 1. Accounts & infrastructure to provision

| # | Service | What to create | Notes / constraints from the code |
|---|---|---|---|
| 1 | **PostgreSQL 15+** | Database + user + connection string | Neon / Supabase / RDS / Cloud SQL. Pool is `max: 5` per serverless instance — prefer a **pooled** endpoint (PgBouncer/Neon pooler) to avoid connection exhaustion. |
| 2 | **Resend** | Account + **verified sending domain** | Needed for verification, invitations, password resets, notifications, scheduled reports. |
| 3 | **Paystack** | Account **activated for live payments** + settlement bank account | Live keys require Paystack business verification (CAC/RC, business bank account). Test keys work end-to-end for rehearsal. |
| 4 | **Vercel** | Already connected: `techpros-one` | Currently **Hobby**. Hobby cron = once/day only. See §5. |
| 5 | **Domain + DNS** | e.g. `app.techpros.com.ng` | Optional but strongly recommended; must match `APP_URL` exactly. |
| 6 | **External scheduler** | cron-job.org / EasyCron / GitHub Actions schedule | Only if you want SLA alerts faster than daily. Calls `/api/cron/run`. |
| 7 | **Monitoring agents** | A small poller per monitored site/device | **Not shipped.** The ingest API exists; no agent binary/script does. See §7. |
| 8 | **Backups / PITR** | Enabled at your Postgres provider + a tested restore | No backup automation is in the repo. |
| 9 | **Uptime + error monitoring** | Uptime check on `/api/health`, error alerting | Recommended, not enforced by code. |

---

## 2. Environment variables — exact names, formats, validation

Set these in **Vercel → Project → Settings → Environment Variables**, scope **Production**
(and Preview if you want preview deployments to work). Never commit them.

| Key | Required for | Exact format / rule enforced in code | How to get it |
|---|---|---|---|
| `APP_MODE` | A | `live` (anything other than `demo` = live) | Set literally to `live` |
| `APP_URL` | A | Full origin, **HTTPS** on Vercel. Must equal the browser's `Origin` **exactly** — scheme + host + port. Mismatch ⇒ every write returns `403 ORIGIN_REJECTED`. | `https://app.yourdomain.ng` |
| `DATABASE_URL` | A | `postgresql://user:pass@host:5432/db?sslmode=require` — including `sslmode=require` or `verify-full` switches on TLS with **certificate verification enabled** | From your DB provider (use the pooled URI) |
| `DATABASE_CA_CERT` | A, **Aiven only** | PEM certificate; inline, `\n`-escaped, or base64 | Aiven Console → Connection information → CA certificate → Show |
| `DATABASE_POOL_MAX` | optional | positive integer, default 3 | Set 2–3; Aiven entry tier caps at 20 total |
| `DATA_ENCRYPTION_KEY` | A | **base64 of exactly 32 bytes.** Wrong length throws at boot. Encrypts MFA secrets (AES-256-GCM). | `openssl rand -base64 32` |
| `CRON_SECRET` | A | **≥ 32 characters.** Sent as `Authorization: Bearer <value>` | `openssl rand -hex 32` |
| `RESEND_API_KEY` | B | Resend secret API key | Resend dashboard → API Keys |
| `EMAIL_FROM` | B | Must be a sender on your **verified** domain, e.g. `TechPros One <no-reply@techpros.com.ng>` | Resend → Domains |
| `PAYSTACK_SECRET_KEY` | C | `sk_live_…` (or `sk_test_…` for rehearsal) | Paystack → Settings → API Keys |
| `API_PORT` | — | Local dev only. **Do not set on Vercel.** | defaults to `8787` |

### Two gotchas that will bite you

1. **One canonical origin.** If `APP_URL=https://app.techpros.com.ng` but someone opens
   `https://techpros-one.vercel.app`, reads work and **all mutations fail** (CSRF/origin check).
   Decide the canonical host and redirect the others to it.
2. **TLS certificate chain — Aiven.** Aiven uses a per-project private CA, so it needs
   `DATABASE_CA_CERT`. Support for this is now implemented (`server/db.ts`, `resolvePgConnection`)
   with 14 regression tests. Without the CA the connection fails with
   `self-signed certificate in certificate chain`. See `docs/DEPLOYMENT.md` §2a.

---

## 3. DNS records you (or your domain admin) must add

| Purpose | Record | Value |
|---|---|---|
| App host → Vercel | `CNAME app` | `cname.vercel-dns.com` (or the exact target Vercel shows) |
| Resend sending domain | `TXT` ×2–3 | SPF + DKIM values Resend generates |
| DMARC (recommended) | `TXT _dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain` |
| Email receiving for support | `MX` | Your mail provider, so `support@` / `accounts@` actually receive replies |

---

## 4. Provider-side configuration (not env vars)

### Paystack
- **Webhook URL:** `https://<your-origin>/api/webhooks/paystack`
- **Event:** `charge.success` (others are safely ignored)
- The server verifies the **HMAC SHA-512** signature and then **re-verifies the transaction**
  before granting anything. Amount, currency (`NGN`), reference and metadata must all match.
- Callback lands on `/app/admin?billing=verify&reference=…`; cancellation on `?billing=cancelled`.

### Resend
- Verify the domain in `EMAIL_FROM` **before** go-live, or all mail sits in the outbox and retries.

### Vercel
- Add the env vars, then **redeploy** (env changes are not retroactive).
- Confirm Node version (project is on 26.x; code requires ≥ 22.12).

---

## 5. Decisions only you can make

| Decision | Options | Default in code today |
|---|---|---|
| **Cron frequency** | Hobby = daily (`0 6 * * *`). For real SLA alerting you need every 1–5 min via external scheduler, or Vercel Pro. | daily |
| **Canonical domain** | `app.techpros.com.ng` vs `techpros-one.vercel.app` | none set |
| **Public demo** | Keep a demo? Set a **separate** preview/project to `APP_MODE=demo`. Live mode has no demo personas. | live = no demo |
| **Billing model** | Currently **prepaid 32-day**, renewed by a manual checkout. Not auto-recurring card charges. | prepaid |
| **Plan prices & seats** | Confirm: Starter ₦19,500/10 · Professional ₦59,500/40 · Business ₦149,500/150 · MSP Launch ₦49,500/15/5 clients · MSP Growth ₦129,500/50/20 · MSP Scale ₦299,500/150/100 | as listed |
| **Trial length** | 14 days, then writes pause until paid (exports still allowed) | 14 days |
| **Tax rates** | VAT 7.5%; WHT 5% / 10% selectable | as listed |
| **SLA calendar** | Africa/Lagos, Mon–Fri 08:00–18:00 + your public-holiday list | Mon–Fri 08–18 |
| **Attachment storage** | Files ≤3 MB, ≤10 per record, stored **inside Postgres**. Fine to start; move to S3/R2 at volume. | Postgres `bytea` |
| **Data retention** | Audit is append-only forever; outbox purged after 30 days. Define your legal retention. | as coded |

---

## 6. Business & legal content to supply

These are **not** optional for a real Nigerian deployment.

- [ ] **Terms of Service** — the sign-up consent checkbox already promises them; **no page exists**.
- [ ] **Privacy Policy / NDPA notice** — same; required before collecting personal data.
- [ ] **Privacy contact / DPO** name + email (NDPA). Consider NDPC registration if you're a major data controller.
- [ ] **Company legal name + address** for invoices (currently prints `techpros.com.ng · Lagos, Nigeria`).
- [ ] **Real bank details** — ⚠️ invoices currently print a **hardcoded placeholder**:
      `TechPros Services Ltd · GTBank 0123456789`. See §7.
- [ ] **Support email** and **accounts email** that actually receive mail
      (`support@techpros.com.ng`, `accounts@techpros.com.ng` are hardcoded today).
- [ ] **Nigerian public-holiday list** for the SLA calendar (YYYY-MM-DD).
- [ ] **Logo / favicon / OG image** — a placeholder `favicon.svg` ships; no social share image.
- [ ] **Marketing claims sign-off** — landing page asserts specific numbers and "Set up in a day".

---

## 7. Code gaps that keys alone will NOT fix

I found these while auditing. They need implementation, not configuration:

| # | Gap | Evidence | Impact |
|---|---|---|---|
| 1 | **Invoice bank details hardcoded** | `src/pages/workspace/Finance.tsx:172` | Every customer's invoice shows the wrong account. `tenant.bankDetails` exists in the schema but the print sheet ignores it. **Blocker for invoicing.** |
| 2 | **No Terms / Privacy routes** | no match in `src/App.tsx` | Consent checkbox links to nothing. **Legal blocker.** |
| 3 | **Setup screen blocks marketing pages** | `src/main.tsx:21` | If config is ever incomplete, the public landing page disappears too. |
| 4 | **No monitoring agent shipped** | only the ingest endpoint exists | "Monitoring" stays empty until a poller posts telemetry. |
| 5 | **"Explore the live demo" → `/login`** | `src/pages/marketing/Landing.tsx:111` | In live mode that's a real login form, not a demo. |
| 6 | **Workspace URL shows `*.app.techpros.com.ng`** | `src/pages/workspace/Admin.tsx:176` | Subdomain tenancy isn't implemented; the app is single-origin. Misleading label. |
| 7 | **Assistant is deterministic analytics, not an LLM** | `src/platform/ai.ts` header | Works with **no API key**. If you want a real LLM, that's a new key + integration work. |

Tell me which of these to fix and I'll do them on this branch.

---

## 8. Ordered runbook once you've supplied the above

```bash
# 1. Provision Postgres, then from a trusted machine with DATABASE_URL set:
npm ci
npm run db:migrate            # forward-only, advisory-locked

# 2. Add all env vars in Vercel (Production scope), then redeploy.

# 3. Verify the server is configured:
curl https://<origin>/api/health     # {"ok":true}
curl https://<origin>/api/ready      # {"ok":true,"database":"reachable","migrations":1}
curl https://<origin>/api/config     # setupRequired must be []

# 4. Configure the Paystack webhook + verify the Resend domain.

# 5. Trigger the scheduler once manually:
curl -X POST https://<origin>/api/cron/run \
     -H "Authorization: Bearer $CRON_SECRET"
```

## 9. Acceptance checklist before announcing

- [ ] `/api/config` returns `setupRequired: []` and `features.email: true`, `features.billing: true`
- [ ] Register → **receive real email** → verify → land in workspace
- [ ] Invite a second person → they accept from their own inbox
- [ ] Enable MFA → sign out → sign in with authenticator → recovery code works once
- [ ] Employee account **cannot** see finance, audit, or another requester's internal notes
- [ ] Second organisation cannot read or write the first organisation's records
- [ ] Paystack **test** payment → webhook → invoice becomes `paid` exactly once (replay is a no-op)
- [ ] Plan checkout → entitlement changes only after server verification
- [ ] Monitoring agent posts `down` → one incident; repeat → no duplicate; `up` → alert resolves
- [ ] Cron run creates due maintenance work orders once, not twice
- [ ] Privacy export downloads; erasure reviewed by a *different* admin
- [ ] **Restore the database backup into a scratch instance and confirm it boots**
- [ ] Load the app on a low-end Android over 3G; keyboard-only pass on login + ticket creation

---

## 10. Fill-in worksheet

Hand these back (secrets via Vercel/GitHub encrypted config, **never** in chat or git):

```
Canonical origin (APP_URL) ......... https://____________________
Postgres provider .................. ____________________
DATABASE_URL ....................... [set directly in Vercel]
DATA_ENCRYPTION_KEY ................ [openssl rand -base64 32 → Vercel]
CRON_SECRET ........................ [openssl rand -hex 32 → Vercel]
Resend sending domain .............. ____________________
EMAIL_FROM ......................... ____________________
RESEND_API_KEY ..................... [set directly in Vercel]
Paystack mode ...................... test / live
PAYSTACK_SECRET_KEY ................ [set directly in Vercel]
Cron frequency chosen .............. daily / external every ___ min
Company legal name ................. ____________________
Invoice bank / account name / NUBAN  ____________________
Support email ...................... ____________________
Accounts email ..................... ____________________
Privacy/DPO contact ................ ____________________
Terms of Service ................... [document or URL]
Privacy Policy ..................... [document or URL]
Public holidays .................... [YYYY-MM-DD list]
```
