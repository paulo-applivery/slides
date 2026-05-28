# Applivery Atlas

Live sales-performance dashboards and TV slideshows. Built with Next.js 14,
React 18, TypeScript strict, Tailwind, Drizzle + SQLite (Cloudflare D1;
better-sqlite3 locally), Auth.js v5, and the Applivery design system.

## Status

**Phase 1 — complete.** Google SSO, SQLite/D1-backed workspaces / users /
dashboards, design system tokens, and all five widget components are live.
Charts run on Recharts + a custom SVG gauge, styled with our tokens.

Next up: **Phase 2** — Stripe + HubSpot OAuth, 5-min cron sync, and the
no-SQL query builder. See [`implementation-plan/`](./implementation-plan/) for
the phased breakdown.

## Quick start

You'll need:

- Node ≥ 20, pnpm
- *(Optional in dev)* a Google OAuth client — create one at
  https://console.cloud.google.com/apis/credentials. Redirect URI:
  `http://localhost:3000/api/auth/callback/google`.

No Docker, no daemon — local dev runs against a SQLite file (`dev.db`)
via `better-sqlite3`. The same schema deploys to Cloudflare **D1** in
production (see "Deploying to Cloudflare" below).

```bash
cp .env.example .env.local
# Fill in AUTH_SECRET (openssl rand -base64 32).
# Fill in INTEGRATIONS_KMS_KEY (openssl rand -base64 32).
# AUTH_GOOGLE_* can stay empty in local dev — see "Dev login" below.

pnpm install
pnpm db:migrate     # creates dev.db + applies the schema
pnpm db:seed        # optional: demo workspace + dashboard
pnpm dev            # → http://localhost:3000
```

### Dev login (bypass Google in local)

When `NODE_ENV !== "production"`, `/login` shows a second "Development"
panel under the Google button:

1. Type any work email — `paulo@volta.so` is pre-filled to match the seed.
2. Click **Continue as this user**.
3. The credentials provider upserts the user, runs the workspace bootstrap
   (first user on a domain → admin, others → editor under `domain-auto`),
   and signs you in.

This shortcut is hard-blocked when `NODE_ENV === "production"` regardless
of the env flag — `loginAsDevUser` in `src/lib/dev-login.ts` returns `null`
before doing anything. Set `ENABLE_DEV_LOGIN=false` to hide the panel in
dev as well (e.g. for screenshots).

## Scripts

| Script             | What it does                                                |
|--------------------|-------------------------------------------------------------|
| `pnpm dev`         | Next dev server on :3000                                    |
| `pnpm build`       | Production bundle                                           |
| `pnpm start`       | Run the production bundle                                   |
| `pnpm lint`        | next lint                                                   |
| `pnpm typecheck`   | `tsc --noEmit`                                              |
| `pnpm db:generate` | Generate a new SQLite migration from `src/lib/db/schema.ts` |
| `pnpm db:migrate`  | Apply pending migrations (creates `dev.db` if missing)      |
| `pnpm db:push`     | Push schema directly without migration files (dev only)     |
| `pnpm db:studio`   | Open Drizzle Studio (browses `dev.db`)                      |
| `pnpm db:seed`     | Idempotent demo seed (workspace + dashboard)                |
| `pnpm db:reset`    | Delete `dev.db` and re-push + seed (nuclear option)         |

## Routes

| Route                    | What you see                                              |
|--------------------------|-----------------------------------------------------------|
| `/`                       | Redirects to `/dashboards` (or `/login` if signed-out)    |
| `/login`                  | Google SSO. Round-trips `?from=` for post-login redirect  |
| `/dashboards`             | DB-backed list. Create, archive, role-gated.              |
| `/dashboards/[id]`        | Detail with inline rename + empty-canvas state            |
| `/integrations`           | Stripe connect (API key), Sync Now, status surfaces       |
| `/api/auth/*`             | NextAuth handlers (callback, signin, signout, session)    |

Middleware at `src/middleware.ts` gates everything except `/login`,
`/api/auth`, and static assets — unauthenticated visitors bounce to
`/login?from=…`.

## Repo layout

```
src/
├── app/                                 ← App Router routes
│   ├── (app)/                           ← authenticated shell route group
│   │   ├── layout.tsx                   ← Sidebar wraps every page in here
│   │   └── dashboards/{page,[id]/page}.tsx
│   ├── api/auth/[...nextauth]/route.ts  ← Auth.js handlers
│   ├── login/{page,google-button}.tsx
│   ├── layout.tsx                       ← html/body, fonts, session, Toaster
│   ├── globals.css                      ← imports tokens / app / screens
│   └── page.tsx                         ← root redirect
├── auth.ts                              ← full Auth.js config (Node, with DB adapter)
├── auth.config.ts                       ← edge-safe slice (used by middleware)
├── middleware.ts                        ← route gating
├── components/
│   ├── ui/Icon.tsx                      ← inline Solar Outline / Bold icons
│   ├── shell/{Sidebar,TopBar,UserMenu}.tsx
│   ├── dashboard/Dashboard.tsx
│   ├── providers.tsx                    ← client SessionProvider wrapper
│   └── widgets/                         ← Recharts + react-gauge-component
├── hooks/useCountUp.ts                  ← animated number tween
├── lib/
│   ├── db/{index,schema,seed}.ts        ← Drizzle: shared Pool + schema + seed
│   ├── db/migrations/                   ← Drizzle-Kit generated SQL
│   ├── dashboards.ts                    ← workspace-scoped queries
│   ├── workspace.ts                     ← domain-based bootstrap on signIn
│   ├── seed.ts                          ← in-memory widget seed (Phase 1 only)
│   ├── theme.ts                         ← useThemeTokens() for chart libs
│   └── format.ts
├── styles/{tokens,app,screens}.css      ← design system + prototype shell
└── types/next-auth.d.ts                 ← session.user augmentation

public/
├── fonts/                               ← self-hosted Outfit 400 / 500 / 600
└── assets/                              ← Applivery wordmark + favicon

prototype/                               ← original Claude Design bundle
implementation-plan/                     ← phased delivery plan + design system
drizzle.config.ts                        ← Drizzle Kit config (SQLite dialect)
dev.db                                   ← local SQLite (git-ignored)
```

## Deploying to Cloudflare

The stack is **Cloudflare-native**:

- **Pages** — host the Next.js app via `@opennextjs/cloudflare`
- **D1** — production database (same SQLite schema as local; the driver
  in `src/lib/db/index.ts` detects the D1 binding on `globalThis.DB`)
- **Cron Triggers** — Phase 2's 5-minute Stripe / HubSpot sync runs here
- **R2** — workspace logos + slideshow export blobs (added in Phase 4–5)
- **Durable Objects + WebSockets** — TV realtime push (Phase 5)

The local migration files in `src/lib/db/migrations/` are
D1-compatible — `wrangler d1 migrations apply slides` will run them
against the live database. Wiring the `wrangler.toml` + OpenNext adapter
lands in a dedicated deploy pass.

## Auth model

- **Provider:** Google OAuth 2.0 via Auth.js v5.
- **Session strategy:** JWT, 24h expiry. The token carries `userId`,
  `workspaceId`, and `role`, refreshed from the DB on signIn.
- **Workspace bootstrap** (in `src/lib/workspace.ts`):
  - First user on a domain → creates a workspace with that domain, becomes
    `admin`.
  - Subsequent users on the same domain → auto-join as `editor` (if the
    workspace's `joinPolicy = "domain-auto"`) or stay un-attached as
    `viewer` (if `invite-only`).
- **Edge safety:** middleware uses the adapter-less `auth.config` slice so
  no `pg` driver runs at the edge. The full config (with Drizzle adapter)
  is reserved for route handlers and server components.

## Design system

Light mode is canonical. Token list lives in
[`implementation-plan/design-system.md`](./implementation-plan/design-system.md);
the runtime values live in `src/styles/tokens.css`. Dark mode is reserved
for TV view; toggled via `[data-theme="dark"]` on `<html>`.

Outfit (sans, 400/500/600 only — never bold ≥ 700) is self-hosted from
`public/fonts/`. JetBrains Mono is served via `next/font/google`
(downloaded at build time, served from our origin).

## What's next

1. **Phase 2** — Stripe + HubSpot OAuth, 5-min cron sync, query AST + builder
   UI, repoint widgets from `lib/seed.ts` to live queries.
2. **Phase 3** — `react-grid-layout` canvas; widget picker modal; config
   panel.
3. **Phase 4** — slideshow editor, TV renderer, QR pairing.
4. **Phase 5** — Supabase Realtime, sync-failure surfaces (toast + sidebar +
   bell tray; no email in v1), onboarding, a11y, perf.
