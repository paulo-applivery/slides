/**
 * Drizzle schema — SQLite dialect. Runs locally on `better-sqlite3` against
 * a `dev.db` file; in production on Cloudflare D1 (same SQL, same Drizzle
 * interface, just a different driver in `db/index.ts`).
 *
 * Type mappings vs the original Postgres schema:
 *   pgEnum                  → text({ enum: [...] }) — column stays string-typed but TS-narrowed
 *   uuid().defaultRandom()  → text().$default(() => crypto.randomUUID())
 *   timestamp({ tz })       → integer({ mode: "timestamp" }) — stored as Unix seconds
 *   jsonb                   → text({ mode: "json" }).$type<...>() — Drizzle handles parse/stringify
 *   boolean                 → integer({ mode: "boolean" })
 *
 * Phase 2 adds: integrations, queries, mirror tables.
 * Phase 4 adds: slideshows, pairing_tokens, tv_sessions.
 */
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import type { SlideAppearance } from "@/lib/appearance";

const ROLES = ["admin", "editor", "viewer"] as const;
const DASHBOARD_THEMES = ["light", "dark"] as const;
const JOIN_POLICIES = ["domain-auto", "invite-only"] as const;
const INTEGRATION_PROVIDERS = ["stripe", "hubspot"] as const;
const INTEGRATION_STATUSES = ["active", "error", "disconnected"] as const;
/**
 * Background-sync lifecycle (separate from connection `status`).
 *   idle     → nothing pending; `lastSyncedAt` reflects the last good run
 *   queued   → a sync was requested (button or auto-refresh); cron will pick it up
 *   running  → a cron tick is actively processing chunks
 *   error    → last chunk threw; `lastError` carries the message
 */
const INTEGRATION_SYNC_STATUSES = ["idle", "queued", "running", "error"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Workspaces
// ─────────────────────────────────────────────────────────────────────────────

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    name: text("name").notNull(),
    /** Email domain used for domain-auto joins; null for invite-only orgs. */
    domain: text("domain"),
    logo: text("logo"),
    joinPolicy: text("join_policy", { enum: JOIN_POLICIES })
      .notNull()
      .default("domain-auto"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => ({
    domainIdx: uniqueIndex("workspaces_domain_idx").on(t.domain),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Users — extends the Auth.js shape with workspace_id + role
// ─────────────────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "timestamp" }),
  image: text("image"),
  // App-specific:
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  role: text("role", { enum: ROLES }).notNull().default("viewer"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth.js adapter tables (drizzle-adapter expects these names)
// ─────────────────────────────────────────────────────────────────────────────

export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = sqliteTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Dashboards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `layout` is an opaque JSON blob describing widget positions + bindings.
 * Phase 3 freezes the shape; for Phase 1 we just store and return it.
 */
export type DashboardLayout = {
  widgets: Array<{
    id: string;
    type: "gauge" | "bar" | "funnel" | "ranking" | "singleValue";
    queryId: string | null;
    pos: { x: number; y: number; w: number; h: number };
    display?: Record<string, unknown>;
  }>;
};

export const dashboards = sqliteTable("dashboards", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  layout: text("layout", { mode: "json" })
    .$type<DashboardLayout>()
    .notNull()
    .$default(() => ({ widgets: [] })),
  /**
   * Light/dark mode for this dashboard. Applied to the canvas in-app and
   * when the dashboard is shown as a TV slide. Defaults to `dark` — TV
   * mode's historical canonical surface.
   */
  theme: text("theme", { enum: DASHBOARD_THEMES }).notNull().default("dark"),
  /** Soft archive flag; we never hard-delete dashboards. */
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

// ─────────────────────────────────────────────────────────────────────────────
// Integrations — Stripe / HubSpot connections per workspace
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row per (workspace, provider). Credentials are stored encrypted via
 * `src/lib/crypto.ts` — never read raw from the DB.
 *
 * `config` carries provider-specific metadata captured at connect time
 * (Stripe account id, HubSpot portal id, etc.) so we don't re-fetch on
 * every sync.
 */
export type IntegrationLastError = {
  at: number; // unix ms
  message: string;
  status?: number;
};

export type IntegrationConfig = {
  stripeAccountId?: string;
  stripeMode?: "test" | "live";
  hubspotPortalId?: number;
  /**
   * HubSpot-only: which CRM properties the operator picked for queries.
   *
   * Stored as objects (not bare names) so the wizard and executor know
   * the property's type without re-hitting HubSpot — a HubSpot `number`
   * field warrants Sum/Avg aggregations, an `enumeration` doesn't.
   *
   * Legacy data (pre-custom-fields) where this is `string[]` is still
   * read by `getHubspotFieldSelection` and lifted to the rich shape at
   * read time.
   */
  selectedFields?: {
    deals: HubspotPickedField[] | string[];
    contacts: HubspotPickedField[] | string[];
  };
};

export type HubspotPickedField = {
  name: string;
  label: string;
  /** HubSpot's reported type — string, number, enumeration, datetime, bool. */
  type: string;
  /** Enumeration values (when the property is an enum). */
  options?: Array<{ label: string; value: string }>;
};

/** Phase the background HubSpot sync is currently working through. */
export type HubspotSyncPhase = "deals" | "contacts" | "owners" | "done";

/**
 * Resumable cursor for the chunked HubSpot sync. Persisted on
 * `integrations.syncState` so a cron tick can pick up exactly where the
 * previous one left off — required because a single Cloudflare Worker
 * invocation can't pull a large portal in one go (subrequest + wall-clock
 * caps). The cursor is the `lastmodifieddate` watermark of the current
 * phase; we re-issue a `GTE cursorMs` search each tick rather than persist
 * HubSpot's `after` token (which isn't stable across invocations).
 */
export type HubspotSyncState = {
  phase: HubspotSyncPhase;
  /** Forward `lastmodifieddate` watermark (unix ms) for the current phase. */
  cursorMs: number;
  /** True while a one-shot full backfill is in progress (mirror was wiped). */
  forceFull: boolean;
  processedDeals: number;
  processedContacts: number;
  /** HubSpot-reported totals captured on the first chunk of each phase. */
  totalDeals?: number;
  totalContacts?: number;
  startedAt: number;
  updatedAt: number;
};

export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: INTEGRATION_PROVIDERS }).notNull(),
    /** AES-GCM ciphertext (base64). For Stripe: the restricted API key. */
    accessTokenEnc: text("access_token_enc").notNull(),
    /** Only used when the provider issues a refresh token (HubSpot). */
    refreshTokenEnc: text("refresh_token_enc"),
    config: text("config", { mode: "json" })
      .$type<IntegrationConfig>()
      .notNull()
      .$default(() => ({})),
    status: text("status", { enum: INTEGRATION_STATUSES })
      .notNull()
      .default("active"),
    /**
     * Background-sync lifecycle. Drives the cron processor + progress UI;
     * independent of connection `status`. See INTEGRATION_SYNC_STATUSES.
     */
    syncStatus: text("sync_status", { enum: INTEGRATION_SYNC_STATUSES })
      .notNull()
      .default("idle"),
    /** Resumable sync cursor — see HubspotSyncState. Null until first sync. */
    syncState: text("sync_state", { mode: "json" }).$type<HubspotSyncState>(),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
    lastError: text("last_error", { mode: "json" }).$type<IntegrationLastError>(),
    /** Cumulative record counts displayed on /integrations + sidebar. */
    recordCount: integer("record_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => ({
    workspaceProviderIdx: uniqueIndex("integrations_ws_provider_idx").on(
      t.workspaceId,
      t.provider,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Stripe mirror tables (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Local mirror of Stripe charges. Sync upserts on (workspace_id, stripe_id).
 * Amounts are stored in cents (Stripe's native unit) — formatted later.
 */
export const stripeCharges = sqliteTable(
  "stripe_charges",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    stripeId: text("stripe_id").notNull(),
    customerId: text("customer_id"),
    amount: integer("amount").notNull(), // cents
    currency: text("currency").notNull(),
    /** Stripe's status — `succeeded`, `pending`, `failed`. */
    status: text("status").notNull(),
    paid: integer("paid", { mode: "boolean" }).notNull(),
    refunded: integer("refunded", { mode: "boolean" }).notNull(),
    description: text("description"),
    /** Original Stripe `created` epoch — used for time-bucket queries. */
    occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => ({
    uniq: uniqueIndex("stripe_charges_ws_id_idx").on(t.workspaceId, t.stripeId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Slideshows (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ordered slides inside a slideshow. Slice 1 supports `dashboard` only;
 * `youtube` and `url` ship in slice 3 alongside iframe X-Frame-Options
 * fallback handling.
 */
export type SlideTransition = "crossfade" | "slide" | "cut";

export type Slide =
  | {
      id: string;
      type: "dashboard";
      dashboardId: string;
      durationSec: number;
      transition: SlideTransition;
      /** Per-slide visual flair (background/glass/brand). Optional — older
       *  rows predate it; renderers fall back to DEFAULT_SLIDE_APPEARANCE. */
      appearance?: SlideAppearance;
    }
  | {
      id: string;
      type: "youtube";
      url: string;
      durationSec: number;
      transition: SlideTransition;
      appearance?: SlideAppearance;
    }
  | {
      id: string;
      type: "url";
      url: string;
      durationSec: number;
      transition: SlideTransition;
      appearance?: SlideAppearance;
    };

// ─────────────────────────────────────────────────────────────────────────────
// TV pairing (Phase 4 slice 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Short-lived pairing token issued when a TV opens /tv/[id] without a
 * tv_session. The token is encoded into the QR code; the PIN is a manual
 * fallback ("enter this PIN at app/pair").
 *
 * Lifecycle: created → polled → confirmed by mobile (usedAt set + tvSessionId
 * populated) → polling returns the session token → TV stores it.
 */
export const pairingTokens = sqliteTable("pairing_tokens", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  slideshowId: text("slideshow_id")
    .notNull()
    .references(() => slideshows.id, { onDelete: "cascade" }),
  /** Opaque base32 token embedded in the QR. */
  token: text("token").notNull().unique(),
  /** 6-digit PIN for manual entry. */
  pin: text("pin").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  usedByUserId: text("used_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  /** Populated once mobile confirms — pointer to the minted tv_session. */
  tvSessionId: text("tv_session_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

/**
 * Long-lived TV session. Stored in the TV's `localStorage`; presented to
 * every public TV endpoint to authorize reads. Tied to one slideshow so a
 * token can't roam to another display.
 */
export const tvSessions = sqliteTable("tv_sessions", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  slideshowId: text("slideshow_id")
    .notNull()
    .references(() => slideshows.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** Random opaque token shown to no one but the TV that owns it. */
  token: text("token").notNull().unique(),
  pairedByUserId: text("paired_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  pairedAt: integer("paired_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  /** Optional human label set on the editor ("Madrid HQ", "Lobby"). */
  label: text("label"),
});

export const slideshows = sqliteTable("slideshows", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slides: text("slides", { mode: "json" })
    .$type<Slide[]>()
    .notNull()
    .$default(() => []),
  /** Used by /tv/[id] when a slide's duration is omitted. */
  defaultDurationSec: integer("default_duration_sec").notNull().default(30),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

// ─────────────────────────────────────────────────────────────────────────────
// Saved queries (Phase 2 slice 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opaque JSON payload describing one query. Shape is enforced at runtime by
 * the Zod schema in `src/lib/queries/ast.ts`. Phase 2 slice 4 ships the
 * `single` kind only — timeseries / groupby / funnel land in slice 5.
 */
export type QueryConfig = unknown;

/**
 * Cached last-run result so the dashboard / TV mode can paint instantly
 * before any client-side refresh. Refreshed whenever a query executes.
 *
 * Shape-agnostic: `summary` is the short string shown in the queries list
 * — for `single` queries it's the formatted value (`€387K`), for
 * `timeseries`/`groupby` it's a row/point count (`8 points`).
 */
export type QueryLastResult = {
  ranAt: number; // unix ms
  ms: number; // execution duration
  /** Short label safe to render in tables. */
  summary: string | null;
  /** Only present for `single` queries. */
  value?: number | null;
  error?: string;
};

export const queries = sqliteTable("queries", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  source: text("source", { enum: INTEGRATION_PROVIDERS }).notNull(),
  config: text("config", { mode: "json" }).$type<QueryConfig>().notNull(),
  lastResult: text("last_result", { mode: "json" }).$type<QueryLastResult>(),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

// ─────────────────────────────────────────────────────────────────────────────
// HubSpot mirror tables (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deals — the unit the funnel and ranking widgets count on.
 * Phase 2 slice 2 ships the columns we need for those two widgets;
 * later slices can grow it (close probability, deal type, etc.).
 */
export const hubspotDeals = sqliteTable(
  "hubspot_deals",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hsId: text("hs_id").notNull(),
    name: text("name"),
    /** EUR/USD amount as a string (HubSpot returns "1234.50" — we keep precision). */
    amount: text("amount"),
    /** Pipeline stage internal id (e.g. "closedwon"). */
    stage: text("stage"),
    pipeline: text("pipeline"),
    ownerId: text("owner_id"),
    closeDate: integer("close_date", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    /**
     * Operator-picked HubSpot custom properties, JSON-encoded as a flat
     * `{ propName: stringValue }` object. We keep all values as strings
     * (HubSpot's own representation) so the executor can `json_extract`
     * without a per-type unmarshal — typed comparisons live in the AST.
     */
    customProperties: text("custom_properties", { mode: "json" })
      .$type<Record<string, string | null>>(),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => ({
    uniq: uniqueIndex("hubspot_deals_ws_id_idx").on(t.workspaceId, t.hsId),
  }),
);

/**
 * Contacts — used for the top of the funnel (Leads, MQLs by lifecyclestage).
 */
export const hubspotContacts = sqliteTable(
  "hubspot_contacts",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hsId: text("hs_id").notNull(),
    email: text("email"),
    ownerId: text("owner_id"),
    /** lifecyclestage: subscriber → lead → marketingqualifiedlead → opportunity → customer */
    lifecycleStage: text("lifecycle_stage"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    /** See `hubspotDeals.customProperties`. */
    customProperties: text("custom_properties", { mode: "json" })
      .$type<Record<string, string | null>>(),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => ({
    uniq: uniqueIndex("hubspot_contacts_ws_id_idx").on(t.workspaceId, t.hsId),
  }),
);

/**
 * Owners — sales reps. Joined to deals via owner_id for the ranking widget.
 */
export const hubspotOwners = sqliteTable(
  "hubspot_owners",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hsId: text("hs_id").notNull(),
    email: text("email"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (t) => ({
    uniq: uniqueIndex("hubspot_owners_ws_id_idx").on(t.workspaceId, t.hsId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations (for Drizzle's relational queries API)
// ─────────────────────────────────────────────────────────────────────────────

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  users: many(users),
  dashboards: many(dashboards),
  integrations: many(integrations),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [integrations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [users.workspaceId],
    references: [workspaces.id],
  }),
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const dashboardsRelations = relations(dashboards, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [dashboards.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [dashboards.createdBy],
    references: [users.id],
  }),
}));
