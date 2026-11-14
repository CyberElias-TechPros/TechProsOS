# Constraints — TechPros One

Last reviewed: 2026-11-13. Applies to every change, human or agent. Changed only by deliberate decision, never to make a failing check pass.

## Floor (always enforced)

- No new suppressions: `@ts-ignore`, `@ts-expect-error` without justification comment, `eslint-disable`
- No unimplemented stubs: no `throw new Error("Not implemented")`, no empty `catch {}`, no TODOs in shipped paths
- No secrets in source. No real credentials, tokens, or customer data — demo data is fictional
- No `dangerouslySetInnerHTML` / `innerHTML` with data that isn't fully controlled and sanitised; in practice: never with user or seed data
- Tenant isolation: every tenant-owned record access goes through the scoped data layer — no module reads another tenant's rows
- Permission checks live in the data layer (the "server boundary"), not by hiding buttons
- Every mutation writes an audit log entry

## Enforced with numbers

| Dimension | Bar | Check |
|---|---|---|
| Type safety | `tsc --noEmit` clean | `npm run typecheck` |
| Tests | All vitest suites green; new business logic ships with tests that fail without it | `npm test` |
| Build | `vite build` succeeds, zero warnings | `npm run build` |
| Bundle | Initial-chunk JS ≤ 300KB gzip (fonts anaemic excepted); any route chunk > 250KB gzip gets split | inspect `vite build` output |
| Accessibility | Keyboard-complete interactions on modal/menus/palette; WCAG AA contrast; `prefers-reduced-motion` honoured | manual + axe-style review |
| CWV targets | LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1 on the preview host | Lighthouse spot check |

## Security posture (demo build)

Client-authoritative demo: data persists in `localStorage`, clearly communicated in-product. Production path documented: Cloudflare Workers + D1 + R2 with the same permission contracts. Auth in demo is illustrative — production requires managed sessions, MFA, bcrypt/argon2 hashing, rate-limited auth endpoints (per `skills/agent-skills/skills/security-and-hardening`).

## Definition of Done (per change)

Tests pass · typecheck clean · build clean · runtime verified · tenant-isolation intact · audit written for new mutations · docs updated · no regressions.
