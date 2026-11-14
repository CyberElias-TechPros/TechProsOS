# todo — TechPros One build log

## CP0 — Exploration & scaffolding
- [x] T1 Skill ingestion (agent-skills vendored to `skills/agent-skills/`, DoD folded into this file's gate)
- [x] T2 Spec distillation → `docs/PRD.md`, `CONSTRAINTS.md` (quality floor), ADR-0001..0003
- [x] T3 Repo scaffold: Vite 5 + TS 5.6 strict, React 18, zustand, routing, vercel.json SPA rewrite + security headers

## CP1 — Platform core
- [x] T3.5 Domain model (`types.ts`), utils, permission engine (`module.resource.action[.scope]`, 13 roles + provider delegation)
- [x] SLA engine: impact×urgency priority matrix, business-minutes targets on UTC work calendars, holidays
- [x] Data layer (`db.ts`): every mutation permission-checked + audit-logged; tenant isolation enforced on every read path
- [x] Session (zustand persist), metrics selectors, net tools (real CIDR math), grounded assistant engine
- [x] Seed: 5 tenants, 12 users, 35+ tickets w/ SLA clocks, assets w/ depreciation, monitored topology, finance, compliance

## CP2 — Verification
- [x] T4 Test suites: permissions, SLA calendar math, Nigeria finance math, CIDR, tenancy isolation (47 tests green)
- [x] Smoke render matrix for workspace pages (jsdom + testing-library)

## CP3 — Product surface
- [x] T5 Design system "Precision Enterprise" (tokens, primitives, dark NOC surface, print sheets)
- [x] T6 Shell: permission-aware sidebar, workspace switcher, ⌘K palette, notification centre, `g t` shortcuts
- [x] Marketing: editorial landing, pricing (org + MSP ₦ tracks), free tools page
- [x] Auth: persona-based demo sign-in + 3-step onboarding that provisions a real tenant
- [x] T7 Overview dashboards (role-aware: exec vs operator)
- [x] T8 Service desk (queue tabs, SLA heat, bulk assign, thread + internal notes, CSAT, KB deflection in composer)
- [x] T9 Assets (register, lifecycle, depreciation, QR labels, CSV export, audit trail per asset)
- [x] T10 Monitoring NOC (topology map SVG, fleet health, alert stream, outage→incident automation + dedupe)
- [x] T11 Maintenance (work orders + checklist discipline + preventive plan scheduler)
- [x] T12 Clients (provider CRM, agreements radar, onboard flow provisioning isolated workspaces)
- [x] T13 Projects (portfolio, kanban, milestones, budget burn, client deliveries)
- [x] T14 Docs/KB (searchable articles, controlled documents w/ review dates)
- [x] T15 Compliance (assessments, findings workflow, 5×5 risk heatmap)
- [x] T16 Procurement (PO approval flow, vendors w/ ratings, stock reorder radar)
- [x] T17 Finance (invoices VAT 7.5%/WHT 5–10% + printable sheets, expenses, budgets, asset book value)
- [x] T18 Reports (executive/ITSM/assets/finance sheets, print→PDF, run history)
- [x] T19 Assistant (grounded replies with basis + deep links), Tools (subnet/VLAN, SLA calc, MikroTik generator, bandwidth), Admin (users/RBAC/invite/plan), Audit trail w/ CSV export, Notification centre

## CP4 — Harden & ship
- [x] T20 Definition-of-done gate (a11y labels/focus, empty/loading/error states, keyboard nav, no console errors, no dead links within routes)
- [x] T21 Performance: route-level lazy chunks (charts/motion split), font variable, CSS-only micro-animations, no layout thrash; bundle: core 45KB gz + vendor 54KB gz, charts deferred (118KB gz on demand)
- [x] T22 Ship: Vercel project `techpros-one` created + production deploy from GitHub — see deployment URL in PR/summary
- [ ] Usage analytics, Paystack billing, real email/WhatsApp adapters — **deferred, non-demo scope** (contacts live in `src/platform/db.ts` seams: `pushNotification`, `createInvoice`)
