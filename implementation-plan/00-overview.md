# Apex (Applivery Atlas) — Implementation Plan Overview

A B2B SaaS sales performance dashboard platform — a Plecto alternative — that
visualizes live revenue KPIs from Stripe and HubSpot, runs slideshows on office
TVs, and pairs displays via QR code.

The visual design is already prototyped in this directory (`index.html` + JSX +
CSS). This plan converts that prototype into a production codebase across five
phases.

## Working name

**Applivery Atlas** (product), Apex (internal codename in the brief).

## Stack

Full library list with bundle weights and rationale lives in
[libraries.md](./libraries.md). The bias is **market-standard, well-maintained,
tree-shakeable**.

| Layer        | Choice                                                          |
|--------------|-----------------------------------------------------------------|
| Frontend     | Next.js 14 (App Router) + React 18 + TypeScript strict          |
| Styling      | Tailwind CSS v4 + design tokens; `clsx` + `tailwind-merge` + CVA |
| UI primitives | Radix UI (per-primitive) + shadcn/ui recipes restyled to tokens |
| Charts       | **Recharts** (BarChart / FunnelChart / sparkline) + **`react-gauge-component`** (Gauge); Ranking stays as a DOM leaderboard |
| Grid         | `react-grid-layout` (12-col canvas)                             |
| Sortable     | `@dnd-kit/core` + `@dnd-kit/sortable` (slide reorder)           |
| Forms        | `react-hook-form` + `zod` (+ `@hookform/resolvers`)             |
| Auth         | Auth.js (NextAuth.js v5), Google OAuth                          |
| API          | tRPC v11 + TanStack Query v5                                    |
| DB           | **Cloudflare D1** (SQLite). Local dev = `dev.db` via `better-sqlite3` — no Docker. |
| ORM          | Drizzle ORM (sqlite dialect, single driver swap for D1)         |
| Sync         | **Cloudflare Cron Triggers** (5-min) — free, built-in           |
| Realtime     | Cloudflare **Durable Objects + WebSockets** (Phase 5)           |
| Blob storage | **Cloudflare R2** (logos, slideshow exports) — zero egress      |
| QR           | `qrcode` (server) + `qrcode.react` (client) + short-lived JWT   |
| Toasts       | `sonner`                                                        |
| Icons        | `@iconify/react` with `@iconify-json/solar` (Outline + Bold)    |
| Tests        | Playwright (E2E + visual regression) + Vitest (unit)            |
| Hosting      | **Cloudflare Pages** (Next.js via `@opennextjs/cloudflare`) + D1 + R2 |

## Design system constraints (binding)

Full spec — color, type, spacing, radii, shadows, motion, components — lives in
[design-system.md](./design-system.md). Every screen must follow it; no
inventing tokens.

Hot summary (verbatim from the spec):

- Light mode is canonical (`#F1F6FF` canvas / `#FFFFFF` cards / `#010258` ink).
  Dark mode in this prototype is an adaptation, not the source of truth — when
  light and dark conflict, light wins.
- **Outfit** at 400/500/600 only — **never ≥ 700**. JetBrains Mono only for
  data values (KPIs, durations, codes), bound to the `.t-mono` class.
- Radii: cards `24px` (`--radius-2xl` = `--radius-card`), buttons/inputs `10px`
  (`--radius-md` = `--radius-button` = `--radius-input`), badges & segmented
  controls pill.
- Brand cobalt `#0241E3` = `--primary-600`. On dark surfaces use
  `--primary-400` (`#5C8BFF`) for AA contrast.
- Shadows are **navy-tinted**, never gray: `rgba(1,2,88,0.06–0.12)`.
- Focus ring is non-negotiable: `--shadow-glow` (4px `rgba(2,65,227,0.18)`)
  on every interactive element.
- Motion: 120–200ms `ease-out`; no bounces or scale on press.
  Chart-specific easings (set in [03](./03-chart-widgets.md)) are layered on
  top, not replacing the chrome easing.
- Stripe `#635BFF` and HubSpot `#FF7A59` are partner brand colors — locked,
  used only on source pills and brand-faithful dots.
- Icons: Solar **Outline** (1.5px stroke) for admin/dashboard surfaces, Solar
  **Bold** for the active/selected state. Loaded via `@iconify/react` with
  `@iconify-json/solar`. No emoji anywhere.
- Pure white pages are off-brand; default page background is the canvas tint
  `#F1F6FF`.

## Phase order

| # | Phase                                  | File                         |
|---|----------------------------------------|------------------------------|
| — | Design system spec (reference)         | [design-system.md](./design-system.md) |
| — | Library choices (reference)            | [libraries.md](./libraries.md) |
| 1 | Foundation                             | [01-foundation.md](./01-foundation.md) |
| 2 | Integrations + Query Engine            | [02-integrations-query-engine.md](./02-integrations-query-engine.md) |
| 3 | Chart Widgets + Dashboard Builder      | [03-chart-widgets.md](./03-chart-widgets.md) |
| 4 | Slideshow + TV Mode                    | [04-slideshow-tv.md](./04-slideshow-tv.md) |
| 5 | Polish (Realtime, Notifications, …)    | [05-polish.md](./05-polish.md) |

## Phase exit criteria (summary)

- **Phase 1** ends when a Google-authenticated user lands on a static dashboard
  inside their workspace.
- **Phase 2** ends when a saved query can pull live numbers from Stripe and
  HubSpot and a 5-min cron is keeping them fresh.
- **Phase 3** ends when all five widget types render from real queries on a
  draggable/resizable grid.
- **Phase 4** ends when a TV pairs via QR and rotates through dashboard /
  YouTube / URL slides.
- **Phase 5** ends when the product feels finished: realtime push, sync alerts,
  empty states, onboarding, responsive.

## Repo layout (target)

```
slides/
├── app/                          ← Next.js App Router
│   ├── (auth)/login/
│   ├── (app)/
│   │   ├── dashboards/
│   │   ├── dashboards/[id]/
│   │   ├── queries/
│   │   ├── slideshows/
│   │   ├── slideshows/[id]/edit/
│   │   ├── integrations/
│   │   └── settings/
│   ├── tv/[id]/                  ← public TV renderer
│   ├── pair/                     ← mobile pairing confirmation
│   └── api/
│       ├── auth/[...nextauth]/
│       ├── trpc/[trpc]/
│       ├── cron/sync/
│       ├── stripe/webhook/
│       └── hubspot/webhook/
├── components/                   ← lifted from prototype JSX
│   ├── widgets/                  ← GaugeChart, BarChart, FunnelChart, …
│   ├── shell/                    ← Sidebar, TopBar
│   ├── tv/                       ← TVUnpaired, TVPaired, slide layouts
│   └── ui/                       ← buttons, badges, segmented, kbd…
├── lib/
│   ├── auth.ts
│   ├── db/                       ← Drizzle schema + migrations
│   ├── integrations/
│   │   ├── stripe.ts
│   │   └── hubspot.ts
│   ├── query/                    ← query AST + executor
│   ├── realtime.ts
│   └── qr.ts
├── styles/                       ← tokens.css, app.css, screens.css
├── public/
├── drizzle.config.ts
├── next.config.mjs
└── implementation-plan/          ← this folder
```

## Cross-phase non-goals

- No raw SQL exposed to users — query builder only.
- No mobile-first responsive in v1 (desktop / TV first; mobile only for `/pair`).
- No billing, no per-seat metering in v1.
- No multi-tenant cross-workspace sharing in v1.

## Risk register

- **HubSpot rate limits** (~100 req/10s) — batch + cursor sync.
- **Stripe data volume on large accounts** — incremental sync via
  `created[gte]` cursor; webhook backfill for canceled subs.
- **iframe slide safety** — sanitize URLs, sandbox iframes, show fallback when
  X-Frame-Options blocks.
- **TV session theft** — pair token TTL 5min, single-use; TV JWT scoped to
  slideshow id + workspace id; rotate on unpair.
