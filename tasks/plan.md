# Implementation Plan — TechPros One

**Spec:** `docs/PRD.md` (condensed from `README.md`). **Quality bar:** `CONSTRAINTS.md`.
**Skills applied:** spec-driven-development, planning-and-task-breakdown, incremental-implementation, frontend-ui-engineering, security-and-hardening, performance-optimization, test-driven-development, code-review-and-quality, documentation-and-adrs, shipping-and-launch — from `skills/agent-skills` (reference copy vendored into this repo).

## Architecture decisions

1. **Single Vite + React + TypeScript app** at repo root (deployable to Vercel as-is), instead of the README's aspirational monorepo — one deployable unit, module folders map 1:1 to the README's `modules/` structure so the split path stays open. (ADR-0001)
2. **Client-authoritative "platform core"** (`src/platform/`): typed entities, reactive store, tenant-scoped data layer that enforces permissions and writes audit logs — the seam where Cloudflare Workers + D1 plug in later. Persistence: versioned `localStorage`. Deterministic seed dataset. (ADR-0002)
3. **Custom design system** ("Precision Enterprise"): CSS variable tokens, light/dark, deep-navy + electric-blue, Inter (self-hosted variable). No UI kit — Nigerian market needs small bundles and the custom system gives the distinctive enterprise look the README demands. Framer Motion for purposeful motion; Recharts lazy-loaded. (ADR-0003)
4. **Route-level code splitting** for every module; heavy libs (recharts, qrcode) behind `React.lazy` / dynamic import.

## Task list

### Phase 1 — Foundation & shell
- [x] T1 Spec, plan, constraints, ADRs
- [ ] T2 Scaffold (Vite+React+TS, deps, tokens, favicon, vercel.json)
- [ ] T3 Platform core: types, store, permissions, audit, session, seed data
- [ ] T4 Unit tests: tenancy isolation, permissions, SLA, money math
- [ ] T5 App shell (sidebar/topbar/command palette/theme/toasts) + router + guards
- [ ] T6 Marketing site (home, platform, pricing, contact, privacy) + auth pages + onboarding wizard

### Phase 2 — Core ITSM slices
- [ ] T7 Overview dashboards (role-aware) + My Work + Notifications
- [ ] T8 Service Desk (list/detail/create, SLA, workflow, CSAT)
- [ ] T9 Assets (register/detail/QR/lifecycle/depreciation/import-export)
- [ ] T10 Maintenance + Work orders + calendar

### Phase 3 — Operations slices
- [ ] T11 Infrastructure NOC: devices, telemetry, topology SVG, alerts → incident automation
- [ ] T12 Projects + kanban + budgets
- [ ] T13 Clients (MSP) + agreements
- [ ] T14 Procurement (vendors/requisitions/PO/stock) + Finance (invoices/expenses/budgets)
- [ ] T15 Docs/KB + Compliance (assessments/risks)

### Phase 4 — Intelligence & platform
- [ ] T16 Reports & analytics (library, filters, CSV, print, builder)
- [ ] T17 AI assistant (permission-aware) + global search
- [ ] T18 Tools & utilities hub
- [ ] T19 Settings/admin: org, structure, users/roles, subscription + upgrade flow, integrations, audit explorer, data controls

### Phase 5 — Harden & ship
- [ ] T20 Full test pass + typecheck + build budgets
- [ ] T21 Five-axis review (correctness/readability/architecture/security/perf) + accessibility sweep + code-simplification pass
- [ ] T22 README update + docs final + deploy to Vercel preview + Lighthouse spot check

## Checkpoints

- **CP1 (after T6):** builds clean, preview serves, sign-in + wizard work end-to-end
- **CP2 (after T10):** core ITSM flows verified at runtime, tests green
- **CP3 (after T15):** all modules navigable with coherent data
- **CP4 (after T19):** feature complete vs PRD acceptance criteria
- **CP5 (after T22):** live preview URL delivered
