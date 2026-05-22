# Library Choices

Every external dependency the plan commits to, with bundle weight and a
one-line rationale. The bias is **standard, well-maintained, tree-shakeable**.
"Smaller" is decided by what actually ships to the browser after tree-shaking
+ minification, not the package install size.

> Numbers below are gzipped, measured via [bundlephobia](https://bundlephobia.com)
> at the time of writing — verify with `next-bundle-analyzer` once integrated.

---

## Core framework

| Concern              | Choice                              | Gzip (est.) | Why                                                                 |
|----------------------|-------------------------------------|-------------|---------------------------------------------------------------------|
| App framework        | **Next.js 14 (App Router)**         | —           | SSR + RSC + edge runtime; industry standard.                        |
| Runtime              | React 18                            | ~6 KB       | Required by Next.                                                   |
| Language             | TypeScript, strict                  | 0           | Compile-time.                                                       |
| Styling base         | Tailwind CSS v4                     | ~3 KB rt    | JIT, tokens stay first-class via `@theme`.                          |
| Utility variants     | `clsx` + `tailwind-merge`           | ~2 KB       | Conditional class composition.                                      |
| CVA                  | `class-variance-authority`          | ~1 KB       | Typed variant API for buttons / badges.                             |

---

## UI primitives (headless + accessible)

| Concern              | Choice                              | Gzip (est.) | Why                                                                 |
|----------------------|-------------------------------------|-------------|---------------------------------------------------------------------|
| Headless components  | **Radix UI** (per-primitive imports)| 4–12 KB ea  | Industry-standard a11y; we only import what we use.                 |
| Recipes / patterns   | **shadcn/ui** (copy-in, not lib)    | 0 vendor    | Source-in-repo components on Radix + Tailwind; we restyle to tokens.|
| Toasts               | **sonner**                          | ~5 KB       | The de-facto modern toast lib (by Emil Kowalski).                   |
| Command palette      | `cmdk`                              | ~7 KB       | If we add ⌘K later; not in v1.                                      |

Radix primitives we'll actually pull: `dialog`, `dropdown-menu`, `popover`,
`select`, `tooltip`, `tabs`, `switch`, `slider` — totals ~30 KB.

---

## Forms + validation

| Concern              | Choice                              | Gzip (est.) | Why                                                                 |
|----------------------|-------------------------------------|-------------|---------------------------------------------------------------------|
| Forms                | **react-hook-form**                 | ~9 KB       | Smallest performant form lib; no re-renders on every keystroke.     |
| Validation           | **zod**                             | ~14 KB      | Standard. Shared between client (RHF) and server (tRPC).            |
| RHF ↔ Zod resolver   | `@hookform/resolvers`               | ~1 KB       |                                                                     |

---

## Data + API

| Concern              | Choice                              | Gzip (est.) | Why                                                                 |
|----------------------|-------------------------------------|-------------|---------------------------------------------------------------------|
| API layer            | **tRPC v11**                        | ~6 KB       | End-to-end types; no codegen.                                       |
| Server state cache   | **TanStack Query v5**               | ~13 KB      | Bundled with tRPC; covers loading, retry, invalidation.             |
| ORM                  | **Drizzle ORM** (sqlite dialect)    | server      | Smallest+fastest TS ORM; one schema runs both local SQLite and D1. |
| Database driver      | `better-sqlite3` (local) / `drizzle-orm/d1` (prod) | server | The factory in `src/lib/db/index.ts` picks at runtime via `globalThis.DB`. |
| Realtime             | **Cloudflare Durable Objects + WebSockets** | server | Same datacenter as Pages + D1; no third-party dependency.  |
| Blob storage         | **Cloudflare R2**                   | server      | S3-compatible; zero egress fees; for logos + slideshow exports.    |
| Client state (small) | **zustand**                         | ~1 KB       | Dashboard editor reducer; nothing else.                             |

We do **not** add Redux. Server state lives in TanStack Query / tRPC; tiny
slices of editor state live in zustand.

---

## Auth + integrations

| Concern              | Choice                              | Gzip (est.) | Why                                                                 |
|----------------------|-------------------------------------|-------------|---------------------------------------------------------------------|
| Auth (Google SSO)    | **Auth.js (NextAuth.js v5)**        | server      | Standard. JWT sessions, edge-safe.                                  |
| Stripe SDK           | `stripe` (server)                   | server      | First-party.                                                        |
| HubSpot SDK          | `@hubspot/api-client`               | server      | First-party.                                                        |
| Crypto (token vault) | `libsodium-wrappers-sumo`           | server      | Authenticated symmetric encryption for OAuth tokens.                |
| QR generation        | **`qrcode`** (server) + `qrcode.react` (client) | 2 + 6 KB | Real scannable QR (server data URL); React variant for client renders.|
| Date math            | **`date-fns`**                      | tree-shakeable | Per-function imports keep this near-zero in the bundle.          |

---

## Charts

Standard chart libraries only — no bespoke SVG for actual chart shapes.
Colors come from CSS custom properties via `useThemeTokens()` so theme
switches re-render.

| Widget         | Library                              | Component used                                       |
|----------------|--------------------------------------|------------------------------------------------------|
| GaugeChart     | **`react-gauge-component`**          | `GaugeComponent type="semicircle"` with needle pointer + 3 sub-arcs (danger / warning / success) |
| BarChart       | **Recharts**                         | `BarChart` + `Bar` (grouped: current vs previous)    |
| FunnelChart    | **Recharts**                         | `FunnelChart` + `Funnel` + `LabelList`; conversion strip rendered as a sibling DS component |
| SingleValue    | **Recharts**                         | `AreaChart` + `Area` with `monotone` curve for the sparkline |
| RankingWidget  | DOM + CSS (FLIP via `--y`)           | A leaderboard list, not a chart — chart libs don't apply |

**Why this split**

- Recharts is the industry standard for React dashboards. Declarative,
  SVG-based (no canvas blur), accepts hex strings directly so we feed it
  our token values.
- `react-gauge-component` is the standard React gauge — covers the
  semi-circle + needle + colored bands shape exactly, ~10 KB.
- The Ranking widget is a sorted list with progress bars and FLIP
  reordering; chart libs don't model "leaderboard". Keep as DOM.

**Tree-shaking notes**

- Recharts isn't perfectly tree-shakeable; the whole `recharts` import
  brings most of the lib. The hit is ~80–95 KB gzipped on the dashboard
  route, accepted in exchange for standard library + free interactivity
  (tooltips, responsive container, animations).
- The gauge is loaded via `next/dynamic` with `ssr: false` so it sits in
  its own client chunk and doesn't bloat first paint.

---

## Layout / interaction

| Concern              | Choice                              | Gzip (est.) | Why                                                                 |
|----------------------|-------------------------------------|-------------|---------------------------------------------------------------------|
| Dashboard grid       | **react-grid-layout**               | ~38 KB      | Canonical 12-col drag/resize/persist; far simpler than rolling our own. |
| Sortable lists       | **`@dnd-kit/core` + `@dnd-kit/sortable`** | ~10 KB | Slideshow slide reordering; accessible; modern replacement for react-dnd. |
| Animation (selective)| `motion` (formerly framer-motion) v11 | tree-shakeable | Only imported in TV slide transitions if CSS gets clumsy; otherwise CSS keyframes from `screens.css`. |
| Cursor idle hook     | tiny custom                         | <0.5 KB     | `useIdleCursor(3000)` for TV mode.                                  |

---

## Icons

| Concern              | Choice                              | Gzip (est.) | Why                                                                 |
|----------------------|-------------------------------------|-------------|---------------------------------------------------------------------|
| Icon set             | **Solar Outline + Solar Bold** (per design system §1.2) | per-icon | We use Outline by default, Bold for the active/selected state.   |
| Loader               | **`@iconify/react`** + `@iconify-json/solar` | ~3 KB core, lazy-loads SVGs | Tree-shaken icon-by-icon; `<Icon icon="solar:tv-outline" />`. |

The prototype's inline Solar-style icons live alongside while we migrate to
Iconify — same `currentColor`/24×24 contract.

---

## Notifications

In-app only for v1 — no email, no SMS, no push. All sync/alert surfaces are
the toast (`sonner`), the sidebar `sb-sync-dot.warn`, and the bell tray in
the top bar. Email as an outbound channel is explicitly deferred to v1.1
and intentionally not in the library list.

---

## Background jobs / sync

| Concern              | Choice                              | Notes                                                                |
|----------------------|-------------------------------------|----------------------------------------------------------------------|
| Cron (5-min sync)    | **Cloudflare Cron Triggers**        | Built-in to Workers; free; matches the rest of the stack.            |
| Job queue (future)   | **Cloudflare Queues**               | Used if sync fans out beyond a single Worker run; deferred to v1.1.  |

---

## Dev tooling

| Concern              | Choice                              | Why                                                                  |
|----------------------|-------------------------------------|----------------------------------------------------------------------|
| Lint / format        | `eslint-config-next` + `prettier`   | Standard.                                                            |
| Type checking        | `tsc --noEmit` in CI                |                                                                      |
| E2E                  | **Playwright**                      | Standard; needed for QR pair flow (two browser contexts).            |
| Unit                 | **Vitest**                          | Faster than Jest; Vite ecosystem.                                    |
| Bundle analyzer      | `@next/bundle-analyzer`             | Verify the budget below.                                             |
| Visual regression    | Playwright `toHaveScreenshot()`     | Per-widget pixel check (Phase 3 UAT).                                |
| a11y CI              | `@axe-core/playwright`              | Phase 5 polish gate.                                                 |

---

## Budget targets

| Surface              | First-load JS gzip target | Notes                                                                       |
|----------------------|----------------------------|-----------------------------------------------------------------------------|
| `/login`             | ≤ 60 KB                    | No Radix, no charts, no grid.                                              |
| `/dashboards/[id]`   | ≤ 230 KB                   | Recharts is ~80–95 KB on its own; RGL + Radix dialogs add ~50 KB on top.    |
| `/tv/[id]`           | ≤ 100 KB                   | Code-split from the app shell; **no** RGL, **no** form libs.               |
| `/pair`              | ≤ 50 KB                    | Mobile-only; minimal.                                                       |

If a route blows past target the analyzer flags it in CI and we revisit.

---

## What we explicitly **don't** add

- **Visx / Nivo / Chart.js / ECharts** — see chart section. We use Recharts
  + `react-gauge-component` for everything chart-shaped.
- **Redux / MobX** — TanStack Query + zustand cover it.
- **Moment.js / Day.js** — date-fns per-function imports.
- **react-dnd** — superseded by dnd-kit.
- **Material UI / Chakra / Ant Design** — design system is bespoke; pulling
  an opinionated library would fight every token.
- **Styled-components / Emotion** — Tailwind + CSS modules (for the prototype's
  `app.css` / `screens.css`) is enough.
- **Lodash** (whole) — native methods + a couple of `lodash-es` per-function
  imports if genuinely needed.
- **Axios** — `fetch` is fine; tRPC wraps it.
