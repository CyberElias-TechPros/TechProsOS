# TechPros One — Design System (“Aurora Enterprise” v2)

Last updated: 14 November 2026. Applies to every surface: marketing, auth, workspace, legal, print.

## Principles

1. **Professional first, showpiece second.** The workspace must survive a NOC shift and a board demo. Motion and glow never outrank legibility (WCAG AA) or the 300 KB JS budget.
2. **One fabric.** Every surface draws from the same tokens in `src/styles/base.css`. No page defines its own palette.
3. **Dark ink is the brand constant.** Sidebar, hero, auth aside and footer bands sit on deep-space navy; light surfaces carry the aurora accents.
4. **Honest decoration.** Glows mark *interactive or live* things (primary actions, active nav, status dots). Static content stays calm.

## Type

| Role | Face | Usage |
|---|---|---|
| UI / body | Inter Variable (`--font`) | 14px base, tables, forms, badges |
| Display | Space Grotesk Variable (`--font-display`) | h1–h4, KPI numerals, prices, brand, eyebrows, stats |
| Mono | system mono (`--mono`) | ticket numbers, tags, CIDR math |

Loaded via `@fontsource-variable/*` (self-hosted, woff2, unicode-range subsets). Fonts are CSS assets — excluded from the JS budget by design, and they load without blocking first paint.

## Colour tokens (`:root`, mirrored in `[data-theme='dark']`)

- `--accent #2e5bff` (indigo) · `--accent-2 #00a5c8` (cyan) · `--accent-3 #7c5cff` (violet)
- `--grad-brand` — 135° indigo→azure; primary buttons, bars, brand mark, featured pricing border
- `--grad-aurora` — 100° sky→cyan→violet; hero gradient text, stat numerals
- Status: `ok #0b8a5f`, `warn #9a5f00`, `bad #c2362a`, `crit #b81607`, `info #0e7490` + `-soft` fills
- `--ink` surfaces: `#080e1d → #060a15` vertical gradient for the rail/hero/aside

All text/background pairs meet AA: `--muted` 5.9:1, `--faint` 4.6:1, white on `--grad-brand` ≥ 4.5:1 at every stop.

## Signature treatments

- **Aurora wash** — `body::before` fixed mesh (three radial tints) + `body::after` 160px SVG grain at 5% overlay. One composited layer; hidden in print.
- **Hairline cards** — `.card::after` paints a soft indigo→violet 1px edge along the top. `.card.flat` and featured pricing opt out.
- **Primary action** — gradient fill, inner highlight, accent glow, and a shine sweep on hover (`::after` skew translate). Press = scale .985.
- **Active nav** — gradient pill + glowing 3px bar (cyan→violet) on the rail edge.
- **Glass chrome** — topbar, marketing nav, popovers, palette and dialogs blur + saturate the aurora wash behind them.

## Motion

- Easings: `--ease-out cubic-bezier(.22,1,.36,1)`, `--ease-spring cubic-bezier(.34,1.56,.64,1)`.
- Page transitions: 280 ms fade/rise (framer-motion, `AppShell`).
- Marketing: GSAP masked-line hero, Lenis smooth scroll, spotlight/tilt/marquee bits.
- `prefers-reduced-motion: reduce` collapses all animation/transition durations to ~0 — enforced globally in `base.css`.

## Components covered by the system (class = contract)

`.btn` (+ `.secondary/.ghost/.danger/.sm/.lg/.block`), `.icon-btn`, `.input/.select/.textarea`, `.seg`, `.badge` (+ tones), `.card` (+ `.flat/.pad-lg`), `.card-title`, `.kpi` (+ `.k-ico`), `.page-head`, `.tbl`, `.tabs`, `.bar`, `.note`, `.banner-*`, `.empty`, `.skeleton`, `.kbd`, `.toast`, `.overlay/.dialog`, `.drawer`, `.steps`, `.chip`, `.avatar`, `.status-dot`, `.kanban/.kb-*`, `.noc`, `.persona`, `.plan-pill`, `.foot-grid`, `.flow-step`, `.sec-item`, `.module-*`, `.hero-*`, `.hm-*`.

Changing these class names requires updating every consumer and the render tests (`tests/smoke.test.tsx`, `tests/landingAudit.test.tsx`, `tests/resilience.test.tsx`).

## Dark mode

`[data-theme='dark']` on `<html>` (user pref, `ThemeToggle`). Every token flips; aurora wash dims; NOC stays dark in both themes by design.

## Budgets & checks

- Initial JS ≤ 300 KB gzip — `node scripts/check-bundle-budget.mjs` (part of `npm run check`).
- CSS is unbounded by the JS budget, but the *font payload* is bounded by fontsource subsets (latin woff2 only).
- New UI must keep keyboard-complete interactions and `:focus-visible` rings (global style, don’t remove).
