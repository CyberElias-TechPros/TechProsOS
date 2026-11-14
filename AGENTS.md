# Working agreements for agents building TechPros One

1. **Read first:** `docs/PRD.md` (what we're building), `README.md` (full blueprint), `CONSTRAINTS.md` (non-negotiable quality bar), `tasks/plan.md` (current plan).
2. **Skills:** this repo vendors `addyosmani/agent-skills` at `skills/agent-skills/`. Apply the relevant skill before non-trivial work — `frontend-ui-engineering` for UI, `security-and-hardening` for anything touching input/auth/tenancy, `test-driven-development` for business logic, `code-review-and-quality` before declaring done, `performance-optimization` for budgets, `shipping-and-launch` before deploys.
3. **Architecture:** platform core in `src/platform/` owns data access, tenancy, permissions, audit. Modules in `src/modules/` never bypass it. Shared UI primitives live in `src/components/`.
4. **Verify before done:** `npm test`, `npm run typecheck`, `npm run build` all clean, plus a runtime check of the flow you touched.
5. **Never** weaken `CONSTRAINTS.md`, introduce real secrets, or break tenant isolation.
