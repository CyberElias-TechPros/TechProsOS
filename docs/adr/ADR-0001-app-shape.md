# ADR-0001 · Single Vite SPA instead of a monorepo of apps

**Status:** Accepted · 2026-11-13

The README proposes a monorepo (`apps/web`, `apps/app`, `apps/control`, `packages/*`) and Cloudflare Workers backend. For v1 we build **one Vite + React + TypeScript SPA** at the repository root containing all three surfaces (marketing at `/`, product at `/app/*`, admin under `/app/settings/*`).

**Why:** one deployable unit on Vercel, one design system, zero build orchestration, fastest path to a working product. The README itself says the monorepo is "a proposed logical structure, not a requirement".

**How the doors stay open:** module folders mirror the README's structure (`src/modules/service-desk`, `src/modules/assets`, …); the data layer contract in `src/platform/` is the seam a Cloudflare Workers + D1 backend will implement later without UI rewrites; route-level code splitting keeps the marketing surface and app surface as separate network payloads.

**Consequences:** no server runtime in this build (acceptable: PRD marks backend integration as post-v1); deployment is static + edge headers.
