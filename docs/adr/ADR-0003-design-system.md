# ADR-0003 · Custom "Precision Enterprise" design system (no UI kit)

**Status:** Accepted · 2026-11-13

The README's stack suggests Material UI. We implement a **custom design system** instead, realised as CSS-variable tokens + a small set of composed primitives (`Button`, `Card`, `Badge`, `Field`, `Table`, `Modal`, `Drawer`, `Tabs`, `Toast`, `EmptyState`, `KPI`).

**Why:**
- **Payload:** Nigerian market = mobile-first and expensive data. A hand-rolled system + route splitting lands far under the ~300KB gzip initial budget; MUI alone approaches the budget.
- **Distinctiveness:** the README asks for "Precision Enterprise — Intelligent Operations", a premium enterprise feel with a dark NOC environment. Custom tokens give that; a stock kit looks generic (and per `frontend-ui-engineering`, avoiding the "AI aesthetic" requires design-system ownership).
- **Density:** enterprise tables/panels need compact, tuned primitives rather than defaults.

**Tokens:** light primary theme, dark secondary; deep navy `#0e1a2b` ink, electric blue accent `#2563eb`-family tuned per theme, success/warn/critical, Inter (self-hosted variable), Space-Grotesk-style display numerals via Inter's tabular figures; 4px spacing scale; restrained elevation; purposeful motion only (Framer Motion, disabled under `prefers-reduced-motion`).

**Consequences:** more CSS authored here, but a stable internal surface that matches the blueprint's visual direction exactly and can later be published as `packages/design-system` if the monorepo ever materialises.
