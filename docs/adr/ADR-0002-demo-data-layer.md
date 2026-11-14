# ADR-0002 · Client-authoritative platform core with enforced tenancy

**Status:** Accepted · 2026-11-13

To make the product fully usable and testable before the Cloudflare backend exists, we ship a **client-authoritative platform core**:

- `src/platform/types.ts` — typed entities for all modules (tenants, users, memberships, tickets, assets, …)
- `src/platform/store.ts` — reactive store, versioned `localStorage` persistence, deterministic seed dataset
- `src/platform/db.ts` — the only path for reads/writes. Enforces: tenant scoping, permission checks (`can()`), audit-log write on every mutation, ID generation
- `src/platform/permissions.ts` — role → permission matrix using `module.resource.action.scope` strings exactly as README §6.4 specifies

**Security honesty:** localStorage is not a security boundary. The product UI says so plainly, demo identities are fictional, and the production path (Workers + D1 + managed sessions) reuses the exact same permission contracts — the checks move to the API boundary without changing call sites. Tenant-isolation and permission behaviour are covered by automated vitest suites today so the same tests validate the future backend.

**Rejected:** Dexie/IndexedDB (async complexity, no benefit at this dataset size); mocked fetch (hides the seams we actually need).
