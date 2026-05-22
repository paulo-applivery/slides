# Phase 1 — Foundation

> **Status: complete.** Google SSO + Drizzle/Postgres + workspace bootstrap +
> design-system shell + 5 widget components are all in. See the repo README
> for the run-book.

Goal: a Google-authenticated user lands on a static dashboard scoped to their
workspace, on the design-system shell from the prototype.

> Design system reference: **[design-system.md](./design-system.md)** —
> tokens, type, radii, shadows, motion, and component specs are binding here.
> Light mode is canonical; the dark prototype theme is an adaptation.
>
> Library choices: **[libraries.md](./libraries.md)**. Phase 1 pulls in
> Next.js 14, Auth.js v5, tRPC v11 + TanStack Query, Drizzle, Tailwind v4,
> Radix (Dropdown, Dialog, Tooltip), `sonner`, `@iconify/react` + Solar.

## Exit criteria

- [ ] User can sign in with Google → lands on `/dashboards`
- [ ] First user with a new email domain creates a workspace; subsequent users
      on the same domain join it (or are queued for invite, configurable)
- [ ] Sidebar + top bar render with the exact tokens/components from
      `app.css` + `tokens.css`
- [ ] A static `/dashboards/[id]` page renders with seed data (no real queries
      yet) — the gauge, bars, funnel, ranking, and single-value widgets come
      from `components/widgets/*` lifted from `widgets.jsx`
- [ ] Theme toggle (dark / light) wired to `data-theme` on `<html>`
- [ ] Drizzle migrations apply cleanly to a fresh Postgres database

## Scope

### 1.1 Next.js + design system

- Init Next.js 14 with App Router, TypeScript strict.
- Tailwind v4 set up — but **token-first**: import `styles/tokens.css` and
  `styles/app.css` as global stylesheets so the prototype's CSS variables
  remain the source of truth.
- Self-host Outfit (400/500/600 only — never 700+) and JetBrains Mono. Do not
  load fonts from Google CDN. Copy fonts from `fonts/` into `public/fonts/`
  and declare the same `@font-face` rules in `tokens.css`.
- Implement the full token surface from [design-system.md](./design-system.md):
  primary scale (50–900), navy scale (50–900), accent scale, semantic
  solid/soft pairs, radii (xs → 3xl + card/button/input/pill aliases), navy-
  tinted shadows (sm/md/lg/glow), and 4-pt spacing scale (1–16).
- Ship the `.t-display / .t-h1 / .t-h2 / .t-h3 / .t-h4 / .t-body / .t-small /
  .t-micro / .t-mono` semantic role classes verbatim from §3.4 of the spec.
- Solar icons: ship `@iconify/react` + `@iconify-json/solar`. Component:
  `<Icon name="tv" variant="outline" />` resolves to `solar:tv-outline`;
  active/selected state swaps to `solar:tv-bold`. The prototype's inline
  icons continue to work alongside while we migrate (same `currentColor` /
  24×24 contract).
- Convert the prototype JSX (`widgets.jsx`, `icons.jsx`, `screen-*.jsx`) into
  TSX components under `components/`. Behavior matches the prototype 1:1; only
  the loading mechanism changes (no Babel-in-browser).

### 1.2 Auth (NextAuth.js v5 + Google)

- Provider: Google OAuth 2.0.
- Session strategy: JWT, 24h expiry, silent refresh on every request.
- Login screen — light canvas (`--bg-canvas` = `#F1F6FF`) with a faint
  ambient brand-tint glow (`--primary-tint`). Centered `.card` (radius
  `24px`, padding `24px`, `--shadow-sm`), Applivery wordmark + tagline
  "Your revenue. Live." in `.t-h2`, supporting copy in `.t-body`, a single
  `<button class="btn-primary">` ("Continue with Google") at the spec'd
  40px / radius 10px / 500 15px Outfit. Focus ring = `--shadow-glow`.
- Voice on the login screen and any auth-related copy follows §1.1 of the
  design system: third-person, no exclamation marks, no marketing fluff.
- Callback: `pages/api/auth/[...nextauth]` issues session + ensures user row
  + workspace assignment.

### 1.3 Workspace + roles

- `workspaces { id, name, domain, logo, created_at, settings JSONB }`
- `users { id, workspace_id, email, name, avatar, google_id, role, created_at }`
  - role enum: `admin | editor | viewer`
- Workspace bootstrap rule (in `settings.joinPolicy`):
  - `domain-auto`: first user on a domain becomes admin; later users on same
    domain auto-join as editor.
  - `invite-only`: subsequent users land on a "Request access" screen.
- All tRPC procedures gated by `workspaceProcedure` that resolves
  `ctx.workspace` from the session.

### 1.4 Database (Drizzle + SQLite / Cloudflare D1)

SQLite-flavor schema runs on `better-sqlite3` locally and Cloudflare **D1**
in production — same Drizzle interface, one driver swap in `db/index.ts`.

```ts
// lib/db/schema.ts
export const workspaces = sqliteTable('workspaces', { ... });
export const users      = sqliteTable('users',      { ... });
export const dashboards = sqliteTable('dashboards', {
  id: text().primaryKey().$default(() => crypto.randomUUID()),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name: text().notNull(),
  layout: text({ mode: 'json' }).$type<DashboardLayout>().notNull()
                                .$default(() => ({ widgets: [] })),
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer({ mode: 'timestamp' }).notNull().$default(() => new Date()),
});
```

Migration tooling: `drizzle-kit generate` + `drizzle-kit migrate` (sqlite
dialect). Migrations checked in under `lib/db/migrations/` and run on D1
via `wrangler d1 migrations apply slides` at deploy.

### 1.5 Shell + dashboard list + static canvas

- `/dashboards` — grid of dashboard cards, name, widget count placeholder,
  last updated, owner avatar. CTA "New dashboard" button (creates an empty
  layout, redirects to `/dashboards/[id]`).
- `/dashboards/[id]` — renders the prototype `Dashboard` component with
  hard-coded `SEED` data. No drag-drop yet, no real queries — Phase 2/3.
- Sidebar lower section ("Queries", "Integrations", "Settings") stays
  `disabled` until Phase 2/3.
- "Launch on TV" button visible but a no-op toast in Phase 1.

## Tasks

1. **Scaffold**: `pnpm create next-app slides --ts --app --tailwind --eslint`,
   add Drizzle + NextAuth + tRPC.
2. **Token integration**: copy `tokens.css`, `app.css`, `screens.css`, `fonts/`,
   `assets/`. Wire into `app/layout.tsx`. Confirm parity vs prototype with
   side-by-side check.
3. **Auth**: NextAuth Google provider; persist user on first sign-in. Tests:
   sign-in flow lands on `/dashboards`.
4. **Workspace bootstrap**: domain-based join logic in `lib/auth/onSignIn.ts`.
5. **Schema + migrations**: workspaces, users, dashboards. Seed script for a
   demo workspace + 1 dashboard with seed layout JSON.
6. **Components**: convert `widgets.jsx` → `components/widgets/*.tsx`,
   `icons.jsx` → `components/ui/Icon.tsx`, `screen-dashboard.jsx` →
   `app/(app)/dashboards/[id]/page.tsx` + child components.
7. **Theme toggle**: persisted in user settings; default `dark`. Component
   lives in top-bar avatar dropdown.
8. **CI**: lint + typecheck + drizzle check.

## Out of scope (defer)

- Real Stripe/HubSpot calls (Phase 2)
- Query builder UI (Phase 2)
- Drag-and-drop grid (Phase 3)
- Slideshow & TV (Phase 4)

## UAT criteria

- Sign in with two different Google accounts on the same domain → both end
  up in the same workspace; second user is `editor`.
- Sign in from a new domain → fresh workspace, user is `admin`.
- Toggle theme → `data-theme` flips on `<html>`, all token values swap, no
  flicker or hard-coded colors leak through.
- Visit `/dashboards/{seed-id}` → the gauge / bars / funnel / ranking / single
  value widgets all render with seed numbers from `SEED`. Ranking still
  reshuffles every ~5.5s using the prototype's mock interval.
