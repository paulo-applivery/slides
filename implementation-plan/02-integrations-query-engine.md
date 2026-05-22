# Phase 2 — Integrations + Query Engine

Goal: connect Stripe + HubSpot via OAuth, sync their data every 5 minutes into
local Postgres tables, expose a no-SQL query builder, and run those queries to
produce numbers consumable by the Phase 1 widgets.

> Library choices: **[libraries.md](./libraries.md)**. Phase 2 adds the
> first-party `stripe` and `@hubspot/api-client` SDKs, `libsodium-wrappers-sumo`
> for the OAuth token vault, `react-hook-form` + `zod` for the query builder
> wizard, and `date-fns` for date-range presets.

## Exit criteria

- [ ] Workspace admin can connect Stripe → OAuth redirect, token stored
      encrypted, sync runs immediately, `/integrations` shows record counts.
- [ ] Workspace admin can connect HubSpot → same flow.
- [ ] Cron sync runs every 5 minutes (Vercel Cron), incremental, idempotent.
- [ ] Manual "Sync Now" works for each integration.
- [ ] Sync error → in-app toast + bell-tray entry + sidebar `sb-sync-dot.warn`
      (no email — see [libraries.md](./libraries.md)).
- [ ] Query builder UI ships matching `screen-dashboard.jsx` config patterns
      (segmented controls, source pill, monospace numbers).
- [ ] A saved query runs against the local mirror tables and returns
      `{ value, formatted, lastRun, ms }`.
- [ ] Phase 1 widgets are repointed from `SEED` to real query results.

## Scope

### 2.1 OAuth — Stripe

- Stripe Connect "Express" or Standard? **Standard** (admins connect their own
  account) for now — Connect later if we offer billed-by-Apex.
- Flow: `/integrations/stripe/connect` → Stripe OAuth → callback writes to
  `integrations` table with `provider='stripe'`, encrypted `access_token`,
  `refresh_token`, `stripe_user_id`, `status='active'`, `last_synced_at=null`.
- Tokens encrypted with libsodium symmetric (`INTEGRATIONS_KMS_KEY` env), never
  returned to the client.

### 2.2 OAuth — HubSpot

- HubSpot OAuth 2.0, scopes:
  `crm.objects.deals.read crm.objects.contacts.read crm.objects.owners.read crm.objects.companies.read crm.schemas.deals.read`
- Refresh token rotation: HubSpot rotates the refresh token on use — store the
  latest one back to the row.

### 2.3 Sync engine

- **Cloudflare Cron Trigger** at `*/5 * * * *` invokes a Worker that calls
  the same Drizzle DB used by the Pages app — D1 binding shared.
- Per workspace × integration:
  - Stripe: incremental `charges.list` and `subscriptions.list` using
    `created[gte]=last_synced_at - 10min` cursor (10min overlap to absorb
    out-of-order events). Webhooks (`charge.updated`,
    `customer.subscription.deleted`) handle late corrections.
  - HubSpot: `crm/v3/objects/deals/search` filtered on
    `hs_lastmodifieddate >= last_synced_at - 10min`. Paginate via `after`
    token. Same for contacts, companies, owners.
- Writes go into normalized tables (see schema below).
- On success: update `integrations.last_synced_at`, `status='ok'`.
- On failure (HTTP 4xx/5xx, schema mismatch): `status='error'`, increment
  `error_count`, write `last_error JSONB`, emit `sync.failed` event.

### 2.4 Schema additions

```ts
export const integrations = pgTable('integrations', {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  provider: text().$type<'stripe' | 'hubspot'>().notNull(),
  accessToken: text('access_token').notNull(),       // encrypted
  refreshToken: text('refresh_token').notNull(),     // encrypted
  externalAccountId: text('external_account_id'),
  status: text().$type<'active'|'error'|'disconnected'>().notNull().default('active'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastError: jsonb('last_error'),
  createdAt: timestamp({ withTimezone: true }).defaultNow(),
});

export const stripeCharges      = pgTable('stripe_charges',      { ... });
export const stripeSubscriptions = pgTable('stripe_subscriptions', { ... });
export const hubspotContacts    = pgTable('hubspot_contacts',    { ... });
export const hubspotDeals       = pgTable('hubspot_deals',       { ... });
export const hubspotOwners      = pgTable('hubspot_owners',      { ... });

export const queries = pgTable('queries', {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  name: text().notNull(),
  source: text().$type<'stripe'|'hubspot'|'mixed'>().notNull(),
  config: jsonb().$type<QueryConfig>().notNull(),
  lastResult: jsonb('last_result'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
});
```

All mirror tables include `(workspace_id, external_id)` unique index for
idempotent upsert.

### 2.5 Query AST

```ts
type QueryConfig =
  | { kind: 'single';    source: 'stripe'|'hubspot'; metric: Metric;
      filters: Filter[]; dateRange: Range }
  | { kind: 'timeseries'; source: 'stripe'|'hubspot'; metric: Metric;
      filters: Filter[]; bucket: 'day'|'week'|'month'; dateRange: Range }
  | { kind: 'groupby';   source: 'stripe'|'hubspot'; metric: Metric;
      filters: Filter[]; groupBy: GroupKey; dateRange: Range; limit?: number }
  | { kind: 'funnel';    stages: QueryConfig[] }; // each stage is a single

type Metric =
  | 'stripe.charge.sum_amount'    | 'stripe.charge.count'
  | 'stripe.subscription.mrr'     | 'stripe.subscription.churn_pct'
  | 'hubspot.deal.sum_amount'     | 'hubspot.deal.count'
  | 'hubspot.contact.count';
```

The executor compiles AST → a parameterized SQL query against mirror tables.
**No raw SQL exposed to the user**.

### 2.6 Query builder UI

Lives at `/queries` (list) and a step-wizard modal:

1. **Source** — segmented control (`.ss-segmented` from `screens.css`):
   Stripe / HubSpot.
2. **Metric** — dropdown filtered by source (`select.btn`-styled).
3. **Filters** — repeatable rows: field → operator → value.
4. **Aggregation / shape** — `single | timeseries | groupby | funnel`.
5. **Date range** — preset chips (This month, Last 30 days, This quarter,
   Custom) using `.range-pill` style.
6. **Preview** — runs the AST, shows the result in the same widget that will
   consume it. Save button persists with a name.

### 2.7 Widget ↔ query binding

- Each widget gets a `queryId` ref in its layout config.
- Dashboard loader pre-fetches all bound queries server-side on
  `/dashboards/[id]` so the first paint already has data (no skeletons on
  initial nav).
- Subsequent refresh = tRPC `queries.run(id)` returning fresh result.

## Tasks

1. **Encryption util**: `lib/crypto.ts` with libsodium secretbox.
2. **OAuth scaffolds**: `/api/integrations/stripe/{start,callback}` and
   `/api/integrations/hubspot/{start,callback}`.
3. **Sync engine v0**: per-provider sync modules in `lib/integrations/`,
   composed by `/api/cron/sync`.
4. **Webhooks**: `/api/stripe/webhook`, `/api/hubspot/webhook` (signature
   verification, idempotent inserts).
5. **Schema migrations** for integrations + mirror tables + queries.
6. **Query AST + executor**: `lib/query/ast.ts`, `lib/query/compile.ts`,
   `lib/query/run.ts`. Unit tests for each AST kind.
7. **`/integrations` UI**: `<IntegrationCard provider="stripe" />` and
   `<IntegrationCard provider="hubspot" />` matching the source-pill / sb-sync
   patterns from `app.css`.
8. **`/queries` UI**: list + wizard.
9. **Repoint widgets** from `SEED` to `useQueryResult(queryId)` hook.

## Out of scope (defer)

- Multi-source mixed queries beyond the brand "Stripe + HubSpot" badge — for
  v1 a funnel can chain a Stripe stage with HubSpot stages but each stage is
  single-source.
- Custom SQL editor for power users.
- Background BullMQ (Vercel Cron is enough for v1).

## UAT criteria

- Connect Stripe in test mode → within 30s, charges + subscriptions appear in
  mirror tables; record counts surface in `/integrations`.
- Connect HubSpot sandbox → same.
- Build a query "Sum of `charge.amount` where `status='paid'`, this month" →
  preview shows a number; save; bind to the MRR single-value widget on a
  dashboard → widget shows the real number.
- Disable Stripe API key → next cron run flips status to `error`; toast
  fires, bell-tray gets an entry, sidebar `sb-sync-dot` switches to `warn`.
- Manual "Sync Now" → triggers immediately, blocks the button with a spinner,
  updates the timestamp.
