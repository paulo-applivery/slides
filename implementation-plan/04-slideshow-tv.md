# Phase 4 — Slideshow + TV Mode

Goal: build the slideshow editor and the TV renderer, including the QR
pairing flow. The TV mode is the product's most visible surface and the
biggest selling demo.

> Design system reference: **[design-system.md](./design-system.md)**.
> Slideshow editor uses the canonical sidebar pattern (§10.8) and segmented
> controls (§10.6). TV mode is the one place the dark adaptation is the
> primary surface (`--secondary` / navy 800/900 background) — every other
> screen, including `/pair`, follows the canonical light palette.
>
> Library choices: **[libraries.md](./libraries.md)**. Phase 4 adds
> `@dnd-kit/core` + `@dnd-kit/sortable` for slide reordering, `qrcode` for
> server-side QR data-URL generation, `qrcode.react` for client renders, and
> Radix `Dialog` for the pair-confirm sheet on mobile. TV mode is
> code-split into its own bundle (no RGL, no form libs).

## Exit criteria

- [ ] User can create a slideshow with ordered slides of three types:
      dashboard, YouTube, web URL.
- [ ] Slideshow editor matches `screen-slideshow.jsx` 1:1 — left list,
      right preview + config.
- [ ] `/tv/[slideshow-id]` route renders in two states:
  - **Unpaired**: QR + 6-digit PIN, expiry countdown.
  - **Paired**: full-bleed auto-rotating slideshow with crossfade
    transitions; ranking reorders animate live; clock + sync dots in corner.
- [ ] Pairing flow works end-to-end: scan QR on phone → `/pair?token=…` →
      confirm → TV starts within 2 seconds.
- [ ] TV session JWT persists 30 days in TV's `localStorage`; revoke
      ("Unpair") works from both ends.
- [ ] Cursor hides after 3s of inactivity in TV mode; no scrollbars; no UI
      chrome other than the four corner blocks.

## Scope

### 4.1 Data model additions

```ts
export const slideshows = pgTable('slideshows', {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  name: text().notNull(),
  slides: jsonb().$type<Slide[]>().notNull().default(sql`'[]'::jsonb`),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp({ withTimezone: true }).defaultNow(),
});

type Slide =
  | { id: string; type: 'dashboard'; dashboardId: string; duration: number; transition: Transition }
  | { id: string; type: 'youtube';   url: string;        duration: number; transition: Transition }
  | { id: string; type: 'url';       url: string;        duration: number; transition: Transition };

type Transition = 'crossfade' | 'slide' | 'cut';

export const pairingTokens = pgTable('pairing_tokens', {
  id: uuid().primaryKey().defaultRandom(),
  slideshowId: uuid('slideshow_id').notNull(),
  token: text().notNull().unique(),       // short opaque, 24-char base32
  pin: char({ length: 6 }).notNull(),     // PIN shown on TV
  createdAt: timestamp({ withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // +5min
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedByUserId: uuid('used_by_user_id'),
});

export const tvSessions = pgTable('tv_sessions', {
  id: uuid().primaryKey().defaultRandom(),
  slideshowId: uuid('slideshow_id').notNull(),
  pairedByUserId: uuid('paired_by_user_id').notNull(),
  pairedAt: timestamp('paired_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // +30d
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  label: text(),  // "Sales floor", "Office lounge"
});
```

### 4.2 Slideshow editor (`/slideshows/[id]/edit`)

Component tree comes straight from `screen-slideshow.jsx`:

```
SlideshowEditor
├── SlideList            (left, 380px)
│   ├── SlideListItem    (drag handle + thumb + meta)
│   └── + Add slide
└── SlideEditor          (right)
    ├── Preview          (SlidePreview with type switch)
    └── ConfigPanel
        ├── Type segmented   (Dashboard / YouTube / URL)
        ├── Source input     (dashboard picker / URL input)
        ├── Duration stepper
        ├── Transition segmented
        └── Meta row (TV URL, auto-loop indicator)
```

- Drag-reorder: `dnd-kit`.
- "Open in TV" button copies a deep link to `/tv/[id]` with a one-click
  pair-or-redirect flow for already-paired browsers.

### 4.3 TV renderer (`/tv/[slideshow-id]`)

Behavior:

1. Component mounts, checks `localStorage.tvSession` for this slideshow.
2. If valid JWT → fetches slideshow + dashboards → renders `TVPaired`.
3. Else → calls `POST /api/tv/pair/start` → receives `{ token, pin,
   expiresAt }` → renders `TVUnpaired`.

Lifted directly from `screen-tv.jsx`:

- `TVUnpaired`: title, instructions, QR card with PIN + countdown.
- `TVPaired`: top-left brand chrome, top-right sync dots + clock, slide
  stage with crossfade, bottom-left progress dots, bottom-right Unpair.

QR encoding: use real `qrcode` npm — encode
`https://app.applivery.com/pair?token=<24char>`.

Slide auto-rotation: per-slide `duration` (default 30s, min 5s, max 600s).
Transition timings come from `screens.css` (`.tv-slide` 800ms cubic).

Polling: while `TVUnpaired`, poll `GET /api/tv/pair/status?token=…` every 2s
until status flips to `paired` → tear down QR, instantiate TV session, swap
to `TVPaired`. Realtime push lands in Phase 5 (Supabase Realtime channel
keyed by the pairing token) — for Phase 4, polling is fine.

### 4.4 Mobile pair confirmation (`/pair`)

- Query param `?token=<24char>`.
- Server resolves token → fetches slideshow name + workspace, validates
  expiry, ensures requester is signed in to the right workspace.
- UI: full-screen card, slideshow name in display 32px, workspace as the
  micro eyebrow, two big buttons: `Pair this TV` (primary), `Cancel`
  (ghost).
- On confirm: `POST /api/tv/pair/confirm` → mints TV session JWT, returns it
  in the response so the mobile can store-and-forward via realtime, **and**
  the TV's poll picks it up. Mobile redirects to `/slideshows`.

### 4.5 Slide renderers

- **Dashboard slide**: fetch dashboard layout + all bound queries server-side,
  render full-bleed at 16:9. Reuse the TV-scale variants from `screens.css`
  (`.tv-layout-gauge`, `.tv-layout-rank`, `.tv-layout-funnel`).
- **YouTube slide**: embed `https://www.youtube.com/embed/<id>?autoplay=1&mute=1&controls=0&loop=1&playlist=<id>`.
- **URL slide**: `<iframe sandbox="allow-scripts allow-same-origin" src={url} />`
  + invisible HEAD probe before mount to detect X-Frame-Options block; if
  blocked → fall back to a styled "Cannot embed" card.

### 4.6 Security

- Pair tokens: 24-char base32, single-use, 5min TTL, deleted on use.
- PIN: 6-digit, separate one-time grant via PIN flow at `app.../pair`.
- TV session JWT: `aud=tv`, `sub=slideshow:<id>`, `exp=30d`,
  `wid=<workspace>`, signed `HS256` with rotating key.
- Revocation: `tvSessions.revokedAt` checked on every `/tv` poll. JWT alone
  is not enough — server verifies the DB row hasn't been revoked.

## Tasks

1. Port `screen-slideshow.jsx` → `app/(app)/slideshows/[id]/edit/page.tsx`
   with `SlideList`, `SlideEditor`, `SlidePreview`.
2. Schema + migrations for slideshows, pairing_tokens, tv_sessions.
3. tRPC routers: `slideshows.list / get / save / create`,
   `tv.startPair / confirmPair / pollStatus / unpair`.
4. QR generation server-side (`qrcode` → data URL) and client-side fallback
   render (the prototype's `QRCode` SVG component) for offline display.
5. TV renderer (`app/tv/[id]/page.tsx`) with TVUnpaired + TVPaired.
6. Mobile pair page (`app/pair/page.tsx`).
7. iframe X-Frame-Options preflight + fallback card.
8. Cursor-hide hook (`useIdleCursor(3000)`).
9. E2E test (Playwright): scan-equivalent visit `/pair?token=…` from a
   second browser context → TV-page DOM swap to `TVPaired` within 3s.

## Out of scope (defer)

- Slideshow templating / copy from another.
- Multi-TV broadcast (one slideshow, n TVs) — naturally supported by the
  data model but the UI / billing for it lands in v1.5.
- Picture-in-picture overlays.

## UAT criteria

- Create a 4-slide slideshow (2 dashboards, 1 YouTube, 1 URL) → save → open
  `/tv/[id]` in a new browser → QR appears with a PIN.
- From phone, scan QR → land on pair confirmation card → tap Pair → TV
  picks it up within 2s → slideshow starts at slide 1.
- Watch full loop → all 4 slides display for their duration, transitions
  match the configured kind, ranking widget on dashboard slides reorders
  with the FLIP transform.
- Click Unpair on TV → QR returns. Open `/tv/[id]` again on the same
  browser → still unpaired (session revoked).
- Try a URL slide with a blocked-iframe host (e.g. github.com) → fallback
  card appears, slideshow keeps advancing.
- Inactive 3s → cursor disappears.
