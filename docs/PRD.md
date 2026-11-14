# TechPros One — Product Requirements (Condensed from README.md)

**Version:** 1.0 · **Date:** 2026-11-13 · **Status:** Approved for build
**Source of truth:** `README.md` (full blueprint). This document condenses it into a shippable v1 scope.

## 1. Product

**TechPros One** — the unified IT operations & business technology platform for businesses and IT service providers in Nigeria (and beyond). Tagline: *Your Technology. Under Control.*

- **Multi-tenant SaaS.** Organisation workspaces manage their own IT; Service Provider workspaces manage multiple client tenants with delegated, audited access.
- **Two audiences, one platform:** businesses (schools, hospitals, SMEs, NGOs, hotels, corporates) and IT service companies.
- **Core principle:** every operational activity produces a traceable record. Tickets link to assets, assets to maintenance, maintenance to procurement, procurement to expenditure, and all of it rolls up into management reports and audit logs.

## 2. v1 Scope (what this build delivers)

Built as a **fully working platform**: a client-authoritative build where the platform core enforces tenancy, permissions, audit logging and business rules exactly as the production API will — with the data access layer isolated so it can be swapped for Cloudflare Workers + D1 without UI rewrites.

| Area | Capabilities in v1 |
|---|---|
| Foundation | Multi-tenant workspace model, auth (demo identities + org registration wizard), 13 organisation/provider roles, permission engine (`module.resource.action.scope`), workspace switching, audit trail on every mutation |
| Service Desk (ITSM) | Full ticket lifecycle (open → triage → assign → in-progress → pending → resolved → confirmed → closed), incident/service-request/problem/change types, impact×urgency priority matrix, SLA policies with business hours, escalation, internal notes vs customer messages, attachments metadata, CSAT, knowledge-linked resolution |
| IT Asset Management | Register with asset tags, categories, serials, purchase/warranty, assignment, transfers, lifecycle (requested→…→disposed), condition, depreciation (straight-line), QR labels, related tickets & maintenance, CSV import/export |
| Infrastructure | Device inventory, availability/latency/packet-loss telemetry (simulated agent streams), dark NOC dashboard, SVG topology map with dependency highlighting, alerts with dedup, alert→incident automation demo |
| Maintenance | Preventive maintenance plans, auto-generated work orders, checklists, technician assignment, calendar view, completion reports, overdue detection |
| Projects | Projects with milestones, kanban tasks, budget vs actual, client linkage, handover report |
| Clients (MSP) | Client organisations, contacts, service agreements/SLA linkage, health rollups, delegated workspace access |
| Procurement | Vendors, requisitions→approval→PO→goods-received flow, stock items with reorder levels, spend rollups |
| Finance (operational) | Quotations & invoices with VAT 7.5% (₦), WHT (5/10%), expenses, budgets, payment records, Paystack-style simulated checkout |
| Documentation | Knowledge base articles (searchable, taggable), document register with versioning, expiry reminders, links to tickets/assets |
| Compliance | Assessment templates & questionnaires with scoring, findings register, risk register with likelihood×impact matrix, remediation tracking, NDPA/ISO 27001/NIST CSF framing (never presented as certification) |
| Reports & Analytics | Executive/IT/technician dashboards, report library, run with date/branch filters, CSV export, print-friendly documents, scheduled-reports stub, custom report builder over permitted data |
| AI Assistant | Permission-aware assistant over platform data: ticket summaries, common-issues analysis, report drafting, KB suggestions. Clearly labelled; never executes consequential actions without confirmation |
| Tools & Utilities | Subnet/VLAN planner (real CIDR math), SLA calculator, invoice generator (VAT/WHT), bandwidth & data-cost estimator, password strength + generator, QR generator, website audit & DNS lookup (labelled simulated), IT cost calculator |
| Admin | Organisation profile, branches/departments/locations, users & invitations, role matrix editor view, subscription & entitlements (plan upgrade flow), integrations catalogue, audit log explorer, data export/reset, NDPA privacy centre |

## 3. Non-functional requirements

- **Nigerian market fit:** ₦ currency, VAT 7.5%, Nigerian cities/LGAs, mobile-first & light on data, NDPA 2023 consent + privacy page, WhatsApp-first support links, bank-transfer/USSD-friendly payment model.
- **Performance:** initial JS < 300KB gz target; every module route-split; CWV "Good" thresholds; no blocking webfonts (self-hosted variable font).
- **Accessibility:** WCAG 2.1 AA contrast, keyboard navigation, focus-visible, ARIA on interactive regions, `prefers-reduced-motion` respected.
- **Security:** RBAC + tenant isolation enforced in the data layer (never just by hiding UI), output encoding everywhere, no secrets, validated inputs, security headers at the edge, NDPA data minimisation.
- **Reliability:** deterministic seed data, versioned local schema with migration guard, export/import of workspace data.

## 4. Out of scope for v1 (per README §18)

Full accounting ERP, HR/payroll, remote desktop, network config automation, SIEM, native mobile app, autonomous AI agents acting on production systems, real payment capture, email/WhatsApp delivery (simulated + labelled).

## 5. Acceptance criteria (release)

1. A visitor can read the marketing site, open pricing, and register a new organisation through the wizard → lands in a working seeded workspace.
2. A user can sign in as demo accounts across roles; dashboards, navigation and available actions change by role; the permission engine (not the UI) blocks unauthorised mutations.
3. Service desk: create → assign → SLA timers run → resolve → requester confirms → closes; CSAT recorded; everything visible in reports and audit log.
4. Assets: register, assign, QR label shows a printable tag, warranty alerts surface, depreciation computed, related tickets linked.
5. Monitoring: NOC shows live-updating devices, topology renders dependencies, an injected outage creates an alert and an incident with an audit trail.
6. Reports aggregate only data the viewer is allowed to see; export CSV; print layout is clean.
7. AI assistant answers questions from authorised records only, and states its data basis.
8. A second tenant cannot see the first tenant's records anywhere — covered by automated tests.
9. `npm run build`, `npm test` and `npm run lint`-level typecheck pass clean.
10. Deploys to Vercel as a preview with SPA routing + security headers.
