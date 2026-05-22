# Phase 5 — Polish

Goal: replace polling with realtime, harden alerting, add empty/onboarding
states, and clean up the long tail of details that separate a working
prototype from a shippable product.

> Design system reference: **[design-system.md](./design-system.md)**.
> Toasts, banners, and onboarding cards use the Callout pattern (§10.5);
> sync-failure surfaces use the Badge `*-soft` pairings (§10.4). All
> microcopy adheres to §1.1 voice rules — third-person, no exclamation
> marks, no hype.
>
> Library choices: **[libraries.md](./libraries.md)**. Phase 5 wires
> `sonner` for toasts, `supabase-js` realtime to replace TV polling,
> `@axe-core/playwright` to gate a11y in CI, and `@next/bundle-analyzer`
> to enforce the per-route budgets defined in libraries.md. **No email
> sender in v1** — all sync/alert surfaces are in-app.

## Exit criteria

- [ ] Dashboard numbers update live without manual refresh when the sync
      engine writes new data.
- [ ] TV mode receives slide-data updates without polling — push only.
- [ ] Sync failures show as toast + bell-tray entry + sidebar
      `sb-sync-dot.warn`. No outbound email in v1.
- [ ] Empty states exist for: no integrations, no queries, no dashboards,
      no slideshows.
- [ ] Onboarding checklist guides a fresh workspace through Connect → Build
      → Display in under 5 minutes.
- [ ] `/pair` works on mobile (only mobile-responsive page).
- [ ] Lighthouse scores: a11y ≥ 95, perf ≥ 90 on `/dashboards/[id]`.
- [ ] Documentation page at `/settings` covers workspace + member admin.

## Scope

### 5.1 Realtime push

- **Cloudflare Durable Objects + WebSockets** — one Durable Object per
  workspace, addressed by `ws:<workspaceId>`. Clients open a WS via
  `/api/realtime/[workspaceId]`; the DO multiplexes pub/sub.
- Sync engine publishes after each successful mirror write:
  `{ type: 'sync.committed', provider, syncedAt, affectedQueryIds }`.
- Dashboard client subscribes and invalidates the affected queries; the
  widget shells trigger their existing `useCountUp` animation, so the
  visible effect is "number quietly changes" — no skeleton flash.
- TV mode subscribes too; ranking reorders happen on real events, not on
  the mocked timer.
- For `/tv` pair status: Supabase Realtime channel keyed by
  `pair:<token>`. The mobile `pair/confirm` endpoint emits a single
  message; the TV closes the QR card on receipt. Polling stays as a
  fallback when the WS connection is degraded.

### 5.2 Sync failure surfacing

In-app only — no outbound email or webhook in v1.

- Domain event `sync.failed { provider, workspaceId, error, retryIn }` fans
  out to three surfaces:
  - **Toast** — `sonner`, `.badge-danger` style, top-right slide-in,
    persistent until dismissed.
  - **Sidebar** — `.sb-sync-dot.warn` (amber) + `.sb-sync-meta` text changes
    to "Last error 3m ago — retry in 2m".
  - **Bell tray** — `<Bell/>` icon in top bar gets a tiny `.badge-danger`
    dot; click opens a `Popover` listing unread alerts with timestamps,
    one-click "Sync now" + "Open integration" links.
- Throttling: one toast per integration per hour; the bell tray accumulates
  the full history and is the audit trail.
- Workspace admins see the same surfaces as editors; viewers see none.

### 5.3 Empty states (binding)

| Surface              | Empty UI                                                            |
|----------------------|---------------------------------------------------------------------|
| `/dashboards` (none) | Big card: "Connect Stripe or HubSpot to get started" + 2 buttons   |
| `/dashboards/[id]` (no widgets) | Full-canvas `.widget-add` with "Add your first widget" |
| `/queries` (none)    | Inline `.widget-add`-style card: "Save your first query"            |
| `/slideshows` (none) | Card with three slide-type thumbnails + "Create slideshow"          |
| `/integrations` (none connected) | Two cards (Stripe, HubSpot) center stage with strong CTAs |

Every empty state directs to the next correct step, never a generic "Nothing
here yet."

### 5.4 Onboarding checklist

- Floating dismissible card bottom-right (uses `.card` + `--shadow-lg`)
  visible until all five items complete:
  1. Sign in (always done at first paint)
  2. Connect Stripe
  3. Connect HubSpot
  4. Build your first query
  5. Publish a TV slideshow
- Each item links to the relevant route. Completed items collapse with a
  green check `<Check/>`.

### 5.5 Responsive (`/pair` only)

The product is desktop / TV first. The single responsive page is `/pair`:

- Mobile portrait 320–480px: full-bleed dark canvas, centered card 88vw,
  big primary button at thumb height.

All other routes show a "Desktop required" gate below 1024px with a "Use
phone for TV pairing" hint and a `/pair` deep-link if a `?token=` is
present.

### 5.6 Accessibility

- All interactive elements keyboard-reachable.
- Focus ring: `box-shadow: var(--shadow-glow)` (already defined).
- Color contrast: gauge bands and badges audited via WCAG AA. `#5C8BFF` on
  `#050B1F` passes for body and large text but not for 12px text — small
  numbers use `--text-primary` instead.
- All charts include a `<title>` + `<desc>` and a fallback
  `aria-label="Q2 revenue gauge: €387K of €500K, 77%"`.
- Ranking widget exposes a screen-reader-only `<ol>` mirror.

### 5.7 Performance

- Defer Recharts (we don't use it).
- Code-split TV mode into its own bundle.
- Tokens + base CSS inlined into `<head>` (small).
- Fonts: `font-display: swap` (already set) + preload only the 4 weights we
  declare.
- Edge runtime for `/tv` GET and `/api/tv/pair/*`.
- Cache layer: per-query result cache with `lastResult` JSONB acts as
  stale-while-revalidate; client serves it instantly while a background
  fetch confirms freshness.

### 5.8 Settings (`/settings`)

- Workspace: name, logo upload, allowed-email-domains (chips — these are
  workspace identity, not a sender), join policy toggle (auto vs invite).
- Members table: avatar, name, email (Google identity column),
  role dropdown (admin/editor/viewer), Remove. Pending invites section.
- Notification preferences: in-app channels only — toggles for "Show
  toast", "Show in bell tray" per event type. Outbound email is deferred
  to v1.1.
- Billing: stub (link out to a billing portal placeholder; ship in v1.1).

## Tasks

1. Supabase Realtime client wired into a `useLiveQuery(id)` hook.
2. Sync engine emits domain events; toast + bell tray + sidebar wired off
   the same bus (no email channel in v1).
3. Empty state components for each surface.
4. Onboarding checklist with progress driven by tRPC `onboarding.status`.
5. Mobile-only CSS for `/pair`; desktop-required gate elsewhere.
6. a11y sweep with `@axe-core/playwright` in CI; chart label generators.
7. Bundle-split TV mode; measure with `next-bundle-analyzer`.
8. `/settings` workspace + members management UI + tRPC.

## Out of scope (defer to v1.1)

- **Outbound email** — transactional sender (Resend / Postmark) + templates
  (react-email) for sync failures, invites, weekly digests. v1 ships
  in-app surfaces only.
- True billing + plans.
- SOC2-grade audit log.
- Mobile dashboards (just `/pair` in v1).
- Custom domain per workspace.

## UAT criteria

- Force a sync failure (revoke a Stripe key) → within one minute: toast,
  sidebar amber, bell-tray entry. No email is sent (verified by checking
  the inbox is empty and the outbound mail log has no record).
- Trigger a successful sync after the failure → all three in-app surfaces
  clear automatically.
- Fresh workspace → onboarding card walks the user from Connect to TV in
  under 5 minutes (timed with a stopwatch).
- Open `/tv/[id]` on a TV → dashboard ranking visibly reorders without any
  polling (verified by network panel: only the realtime websocket
  exchanges messages).
- Lighthouse on `/dashboards/[id]` (cold cache, throttled 4G): a11y ≥ 95,
  perf ≥ 90, best-practices ≥ 95.
- Visit any non-`/pair` route on a 375×667 viewport → "Desktop required"
  gate appears; visit `/pair?token=…` on the same viewport → mobile card.
