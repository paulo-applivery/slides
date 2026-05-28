/**
 * HubSpot integration — validate Private App tokens, sync deals / contacts /
 * owners into local mirror tables.
 *
 * Phase 2 slice 2 supports Private App access tokens only (the modern,
 * simpler auth method; equivalent to Stripe's restricted keys). OAuth 2.0
 * for prod lands in a later slice once we configure the deploy URI.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  hubspotContacts,
  hubspotDeals,
  hubspotOwners,
  integrations,
} from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// ─────────────────────────────────────────────────────────────────────────────
// HubSpot REST client (direct fetch)
// ─────────────────────────────────────────────────────────────────────────────
//
// We call HubSpot's public REST API directly instead of via
// `@hubspot/api-client`. The official SDK bundles generated clients for every
// HubSpot product (tens of MB) which pushed the Cloudflare Worker past its
// size limit; we only need a handful of CRM endpoints.

const HUBSPOT_API_BASE = "https://api.hubapi.com";

/** Subset of HubSpot CRM Search filter operators we use. */
type FilterOperator = "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE" | "BETWEEN";

class HubspotApiError extends Error {
  /** HTTP status, exposed as `code` so the shared 429 extractor keeps working. */
  code: number;
  headers: Record<string, string>;
  body: string;
  constructor(status: number, headers: Record<string, string>, body: string) {
    super(`HubSpot API ${status}: ${body.slice(0, 500)}`);
    this.name = "HubspotApiError";
    this.code = status;
    this.headers = headers;
    this.body = body;
  }
}

async function hsFetch<T>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${HUBSPOT_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    throw new HubspotApiError(res.status, headers, text);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting + retry
// ─────────────────────────────────────────────────────────────────────────────
//
// HubSpot's `publicapi:crm:search:oauth` policy caps Private App tokens at
// ~4 requests/second. The CRM Search endpoint is the bottleneck for our
// sync (deals + contacts). We:
//
//   1. Serialize search calls behind a token bucket spaced 350 ms apart
//      (≈ 2.85 req/sec — safely below the 4/sec ceiling, leaves headroom
//      for parallel users on the same portal).
//   2. Retry on 429 with exponential backoff, honouring the `Retry-After`
//      header HubSpot returns when set.
//
// The limiter is module-scoped — fine for the local single-process dev
// server. When this moves to Cloudflare Workers at scale we'll want a
// per-portal Durable Object bucket; for now one global queue is correct
// because there's exactly one HubSpot integration per workspace and the
// sync runs in-process.

const SEARCH_MIN_INTERVAL_MS = 350;
let searchNextAvailable = 0;

async function throttleSearch(): Promise<void> {
  const now = Date.now();
  const target = Math.max(now, searchNextAvailable);
  searchNextAvailable = target + SEARCH_MIN_INTERVAL_MS;
  if (target > now) {
    await new Promise((r) => setTimeout(r, target - now));
  }
}

/**
 * Wrap a HubSpot API call with the search-API throttle + 429 retry.
 * Use this for **every** `searchApi.doSearch` invocation; other endpoints
 * have looser limits and don't need it.
 */
async function withSearchRateLimit<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  await throttleSearch();
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = extractStatusCode(err);
      if (code !== 429) throw err;
      if (attempt === maxRetries) throw err;
      const retryAfterSec = extractRetryAfter(err);
      const backoffMs = retryAfterSec
        ? retryAfterSec * 1000
        : Math.min(8000, 500 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  // Unreachable — TS can't see the throw above.
  throw new Error("withSearchRateLimit: exhausted retries");
}

/** HubSpot SDK errors expose status via a few shapes; check all. */
function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e.code === "number") return e.code as number;
  const resp = e.response as Record<string, unknown> | undefined;
  if (resp && typeof resp.status === "number") return resp.status as number;
  return undefined;
}

function extractRetryAfter(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  const headers =
    (e.headers as Record<string, string> | undefined) ??
    ((e.response as Record<string, unknown> | undefined)?.headers as
      | Record<string, string>
      | undefined);
  if (!headers) return undefined;
  // Header keys may be lower- or mixed-case depending on fetch impl.
  const raw =
    headers["retry-after"] ?? headers["Retry-After"] ?? headers["RETRY-AFTER"];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Validate by hitting the account-info endpoint. Throws on bad token /
 * scope mismatch / network. Returns the portal id for `integrations.config`.
 */
export async function validateHubspotToken(accessToken: string) {
  if (!/^pat-(na1|eu1)-[a-f0-9-]+$/i.test(accessToken)) {
    throw new Error(
      "HubSpot Private App tokens look like `pat-na1-…` or `pat-eu1-…`.",
    );
  }
  // Confirm the token works by hitting the users endpoint; fall back to a
  // lightweight call — listing 1 deal — if that endpoint isn't in scope.
  // Token validity is confirmed either way (an invalid token throws).
  const usersOk = await hsFetch(accessToken, "GET", "/settings/v3/users?limit=1")
    .then(() => true)
    .catch(() => false);
  if (!usersOk) {
    await hsFetch(accessToken, "GET", "/crm/v3/objects/deals?limit=1");
  }
  // Portal id isn't exposed by every endpoint; fetch it via the account-info
  // endpoint on the integrations namespace.
  const acctBody = await hsFetch<{ portalId?: number }>(
    accessToken,
    "GET",
    "/integrations/v1/me",
  );
  return {
    hubspotPortalId: acctBody.portalId,
  };
}

export async function connectHubspot(workspaceId: string, accessToken: string) {
  const meta = await validateHubspotToken(accessToken);
  const enc = await encryptSecret(accessToken);

  await db
    .insert(integrations)
    .values({
      workspaceId,
      provider: "hubspot",
      accessTokenEnc: enc,
      config: { hubspotPortalId: meta.hubspotPortalId },
      status: "active",
    })
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.provider],
      set: {
        accessTokenEnc: enc,
        config: { hubspotPortalId: meta.hubspotPortalId },
        status: "active",
        lastError: null,
      },
    });

  return meta;
}

export async function disconnectHubspot(workspaceId: string) {
  await db
    .delete(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.provider, "hubspot"),
      ),
    );
  // Cascade cleanup of mirror tables.
  await Promise.all([
    db.delete(hubspotDeals).where(eq(hubspotDeals.workspaceId, workspaceId)),
    db.delete(hubspotContacts).where(eq(hubspotContacts.workspaceId, workspaceId)),
    db.delete(hubspotOwners).where(eq(hubspotOwners.workspaceId, workspaceId)),
  ]);
}

export async function getHubspotIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.provider, "hubspot"),
    ),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Field discovery + selection
// ─────────────────────────────────────────────────────────────────────────────
//
// Plecto-style flow: when an operator connects an integration we show them
// the available properties on each CRM object and let them pick which ones
// the query wizard should expose. The picks are stored on the integration
// row (`config.selectedFields`) so they travel with the connection.
//
// Today only the standard properties (the ones our mirror tables have
// columns for) are actually queryable. Custom properties show up in the
// listing as `syncable: false` so operators can see them but understand
// they're not pluggable into queries yet.

export type HubspotObjectKey = "deals" | "contacts";

export type HubspotPropertyInfo = {
  name: string;
  label: string;
  /** HubSpot's reported type — string, number, enumeration, datetime, etc. */
  type: string;
  fieldType: string | null;
  /**
   * Whether this property has a dedicated mirror column (vs. going into
   * `custom_properties` JSON). Doesn't gate ticking — every property is
   * pickable now — but the UI badges it so operators understand the
   * storage model.
   */
  hasDedicatedColumn: boolean;
  /** True for hs_* / created* / system-owned properties. */
  isHubspotDefined: boolean;
  /**
   * Enumeration values. Present iff `type === "enumeration"`. The filter
   * value picker uses these to render a dropdown instead of a free-text
   * input; the field picker shows the first couple as a preview.
   */
  options?: Array<{ label: string; value: string }>;
};

/**
 * Standard properties our mirror tables have dedicated columns for.
 * Everything else syncs into `custom_properties` (JSON) on the row.
 *
 * `syncable` in the discovery response now means **everything is
 * syncable** — the flag has been retired. We still expose this set
 * because the sync needs to know which fields go to columns vs. JSON.
 */
const STANDARD_DEAL_PROPS = new Set([
  "dealname",
  "amount",
  "dealstage",
  "pipeline",
  "closedate",
  "hubspot_owner_id",
  "createdate",
]);

const STANDARD_CONTACT_PROPS = new Set([
  "email",
  "hubspot_owner_id",
  "lifecyclestage",
  "createdate",
]);

/**
 * Fetch the live property catalog from HubSpot for both deals + contacts.
 * Errors propagate to the caller — typically a server action that turns
 * them into a user-visible toast.
 */
export async function listHubspotProperties(
  workspaceId: string,
): Promise<Record<HubspotObjectKey, HubspotPropertyInfo[]>> {
  const row = await getHubspotIntegration(workspaceId);
  if (!row) throw new Error("HubSpot is not connected for this workspace.");
  const token = await decryptSecret(row.accessTokenEnc);

  type RawProperty = {
    name: string;
    label: string;
    type: string;
    fieldType?: string;
    hubspotDefined?: boolean;
    options?: Array<{ label?: string; value?: string; hidden?: boolean }>;
  };
  type PropertiesResponse = { results: RawProperty[] };
  type PipelinesResponse = {
    results?: Array<{
      id?: string;
      label?: string;
      stages?: Array<{ id?: string; label?: string }>;
    }>;
  };

  // Properties + Pipelines API are on the standard 100 req/10s tier —
  // well within our cost. Pipeline / dealstage are special: their enum
  // options aren't on the property itself; we have to ask the Pipelines
  // API. We fetch deals pipelines in parallel with the properties calls
  // and enrich the property entries before returning.
  const [deals, contacts, pipelines] = await Promise.all([
    hsFetch<PropertiesResponse>(token, "GET", "/crm/v3/properties/deals"),
    hsFetch<PropertiesResponse>(token, "GET", "/crm/v3/properties/contacts"),
    hsFetch<PipelinesResponse>(token, "GET", "/crm/v3/pipelines/deals").catch(
      (err) => {
        // Pipelines being unavailable shouldn't kill the whole discovery.
        // Log and proceed with empty options for pipeline/dealstage.
        console.warn(
          "[hubspot] pipelines fetch failed:",
          err instanceof Error ? err.message : err,
        );
        return null;
      },
    ),
  ]);

  const dealsWithEnrichment = deals.results.map((p) => {
    const base = mapProperty(p, STANDARD_DEAL_PROPS);
    return enrichWithPipelineOptions(base, pipelines);
  });

  return {
    deals: dealsWithEnrichment,
    contacts: contacts.results.map((p) =>
      mapProperty(p, STANDARD_CONTACT_PROPS),
    ),
  };
}

/**
 * Inject Pipelines-API-sourced options into the `pipeline` and `dealstage`
 * properties. HubSpot's Properties API returns these as `enumeration`
 * type but with empty `options` — the actual values live in the
 * Pipelines API since they're operator-configurable in HubSpot.
 */
function enrichWithPipelineOptions(
  prop: HubspotPropertyInfo,
  pipelines: { results?: Array<{ id?: string; label?: string; stages?: Array<{ id?: string; label?: string }> }> } | null,
): HubspotPropertyInfo {
  if (!pipelines?.results || pipelines.results.length === 0) return prop;
  if (prop.options && prop.options.length > 0) return prop;

  if (prop.name === "pipeline") {
    const opts = pipelines.results
      .filter((p) => p.id && p.label)
      .map((p) => ({ label: p.label!, value: p.id! }));
    if (opts.length === 0) return prop;
    return { ...prop, options: opts };
  }

  if (prop.name === "dealstage") {
    // Stages are per-pipeline; flatten and dedup by id. Label the
    // ambiguous ones with their pipeline name to make picking unambiguous.
    const seen = new Set<string>();
    const opts: Array<{ label: string; value: string }> = [];
    const labelCounts = new Map<string, number>();
    for (const pl of pipelines.results) {
      for (const st of pl.stages ?? []) {
        if (!st.id || !st.label) continue;
        labelCounts.set(st.label, (labelCounts.get(st.label) ?? 0) + 1);
      }
    }
    for (const pl of pipelines.results) {
      for (const st of pl.stages ?? []) {
        if (!st.id || !st.label || seen.has(st.id)) continue;
        seen.add(st.id);
        const sharesLabel = (labelCounts.get(st.label) ?? 0) > 1;
        const label = sharesLabel ? `${st.label} (${pl.label})` : st.label;
        opts.push({ label, value: st.id });
      }
    }
    if (opts.length === 0) return prop;
    return { ...prop, options: opts };
  }

  return prop;
}

function mapProperty(
  p: {
    name: string;
    label: string;
    type: string;
    fieldType?: string;
    hubspotDefined?: boolean;
    options?: Array<{ label?: string; value?: string; hidden?: boolean }>;
  },
  standardSet: Set<string>,
): HubspotPropertyInfo {
  const options =
    p.type === "enumeration" && Array.isArray(p.options)
      ? p.options
          // HubSpot exposes archived/hidden enum options; only show visible.
          .filter((o) => o && !o.hidden && o.value != null)
          .map((o) => ({
            label: (o.label ?? o.value)!.toString(),
            value: o.value!.toString(),
          }))
      : undefined;
  return {
    name: p.name,
    label: p.label,
    type: p.type,
    fieldType: p.fieldType ?? null,
    hasDedicatedColumn: standardSet.has(p.name),
    isHubspotDefined: !!p.hubspotDefined,
    options,
  };
}

/** The persisted shape on `integrations.config.selectedFields`. */
export type HubspotPickedField = {
  name: string;
  label: string;
  type: string;
  /** Enumeration options, when the property is an enum. */
  options?: Array<{ label: string; value: string }>;
};

export type HubspotFieldSelection = {
  deals: HubspotPickedField[];
  contacts: HubspotPickedField[];
};

const DEFAULT_DEAL_FIELDS: HubspotPickedField[] = [
  { name: "dealname", label: "Deal Name", type: "string" },
  { name: "amount", label: "Amount", type: "number" },
  { name: "dealstage", label: "Deal Stage", type: "enumeration" },
  { name: "pipeline", label: "Pipeline", type: "enumeration" },
  { name: "closedate", label: "Close Date", type: "datetime" },
  { name: "hubspot_owner_id", label: "Deal owner", type: "enumeration" },
  { name: "createdate", label: "Create Date", type: "datetime" },
];

const DEFAULT_CONTACT_FIELDS: HubspotPickedField[] = [
  { name: "email", label: "Email", type: "string" },
  { name: "hubspot_owner_id", label: "Contact owner", type: "enumeration" },
  { name: "lifecyclestage", label: "Lifecycle Stage", type: "enumeration" },
  { name: "createdate", label: "Create Date", type: "datetime" },
];

/**
 * Read the operator's current selection. Defaults to the standard set
 * when nothing is persisted yet. Lifts legacy `string[]` data to the
 * rich `{name,label,type}[]` shape so old workspaces keep working.
 */
export function getHubspotFieldSelection(
  integration: { config?: unknown } | undefined | null,
): HubspotFieldSelection {
  const cfg = (integration?.config as Record<string, unknown> | undefined) ?? {};
  const sel = cfg.selectedFields as
    | { deals?: unknown; contacts?: unknown }
    | undefined;
  return {
    deals: liftLegacy(sel?.deals, DEFAULT_DEAL_FIELDS),
    contacts: liftLegacy(sel?.contacts, DEFAULT_CONTACT_FIELDS),
  };
}

function liftLegacy(
  raw: unknown,
  defaults: HubspotPickedField[],
): HubspotPickedField[] {
  if (!Array.isArray(raw)) return defaults;
  if (raw.length === 0) return [];
  // Legacy: array of bare strings — lift to {name, label: name, type: "string"}.
  if (typeof raw[0] === "string") {
    return (raw as string[]).map((name) => ({ name, label: name, type: "string" }));
  }
  // Rich shape — filter to entries that have at least a name.
  return (raw as Array<Partial<HubspotPickedField>>)
    .filter((f) => typeof f.name === "string" && f.name.length > 0)
    .map((f) => ({
      name: f.name!,
      label: f.label ?? f.name!,
      type: f.type ?? "string",
      options: Array.isArray(f.options) ? f.options : undefined,
    }));
}

/**
 * Persist a new field selection on the integration row. Every picked
 * property is allowed — standard ones go to mirror columns, custom ones
 * land in `custom_properties` JSON at sync time.
 */
export async function updateHubspotFieldSelection(
  workspaceId: string,
  selection: HubspotFieldSelection,
): Promise<void> {
  const row = await getHubspotIntegration(workspaceId);
  if (!row) throw new Error("HubSpot is not connected.");
  // Dedup by name (defensive — the UI shouldn't allow duplicates).
  const dedup = (arr: HubspotPickedField[]) => {
    const seen = new Set<string>();
    return arr.filter((f) => {
      if (seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    });
  };
  const nextConfig = {
    ...((row.config as Record<string, unknown> | null) ?? {}),
    selectedFields: {
      deals: dedup(selection.deals),
      contacts: dedup(selection.contacts),
    },
  };
  await db
    .update(integrations)
    .set({ config: nextConfig })
    .where(eq(integrations.id, row.id));
}

/**
 * Helpers for the sync path — split the picked fields into the ones
 * that go to dedicated columns vs. the JSON blob.
 */
export function splitFields(
  picked: HubspotPickedField[],
  standardSet: Set<string>,
): { standard: string[]; custom: HubspotPickedField[] } {
  const standard: string[] = [];
  const custom: HubspotPickedField[] = [];
  for (const f of picked) {
    if (standardSet.has(f.name)) standard.push(f.name);
    else custom.push(f);
  }
  return { standard, custom };
}

/**
 * Read the workspace's HubSpot field selection AND ensure all picked
 * enumeration properties have their `options` populated. Called by
 * query-page server components so legacy picks (made before the
 * options-capture feature shipped) self-heal without the operator
 * needing to revisit `/integrations`.
 *
 * Hits the HubSpot Properties API at most once per call, and only when
 * at least one picked enum is missing options. Persists the patch back
 * to the integration row so subsequent renders are free.
 */
export async function getHubspotFieldSelectionWithFreshOptions(
  workspaceId: string,
): Promise<HubspotFieldSelection> {
  const row = await getHubspotIntegration(workspaceId);
  if (!row) return { deals: [], contacts: [] };
  const selection = getHubspotFieldSelection(row);

  // Cheap pre-check: skip the discovery round-trip entirely when every
  // ticked enum already has options. This is the steady-state path.
  const needsPatch = (group: HubspotPickedField[]) =>
    group.some(
      (f) =>
        f.type === "enumeration" && (!f.options || f.options.length === 0),
    );
  if (!needsPatch(selection.deals) && !needsPatch(selection.contacts)) {
    return selection;
  }

  let discovered: Record<HubspotObjectKey, HubspotPropertyInfo[]>;
  try {
    console.log(
      "[hubspot] backfill: fetching discovery for workspace",
      workspaceId.slice(0, 8),
    );
    discovered = await listHubspotProperties(workspaceId);
    console.log(
      "[hubspot] backfill: got",
      discovered.deals.length,
      "deal props,",
      discovered.contacts.length,
      "contact props",
    );
  } catch (err) {
    // Discovery failure (rate limit, invalid token, network) — fall
    // back to whatever's persisted. The wizard will gracefully show a
    // text input for fields without options.
    console.warn(
      "[hubspot] backfill: discovery failed, falling back to stale selection:",
      err instanceof Error ? err.message : err,
    );
    return selection;
  }

  function patch(
    group: HubspotPickedField[],
    discoveredGroup: HubspotPropertyInfo[],
  ): HubspotPickedField[] {
    return group.map((f) => {
      if (f.options && f.options.length > 0) return f;
      const live = discoveredGroup.find((p) => p.name === f.name);
      if (!live || live.type !== "enumeration") return f;
      if (!live.options || live.options.length === 0) return f;
      return { ...f, type: live.type, options: live.options };
    });
  }
  const fresh: HubspotFieldSelection = {
    deals: patch(selection.deals, discovered.deals),
    contacts: patch(selection.contacts, discovered.contacts),
  };

  // Persist so the next page render hits the steady-state path. Await
  // — Next.js can cut off promises that outlive the request, and the
  // first time we ran this with `void` the patch never made it to disk.
  // One extra DB write per backfill is a fair cost.
  try {
    await updateHubspotFieldSelection(workspaceId, fresh);
  } catch (err) {
    console.warn(
      "[hubspot] backfill: persist failed (will retry next page hit):",
      err instanceof Error ? err.message : err,
    );
  }

  return fresh;
}

export { STANDARD_DEAL_PROPS, STANDARD_CONTACT_PROPS };

/**
 * Always-required system properties — needed for cursor / sort, but not
 * exposed as queryable fields. Union'd with the operator's picks when
 * we hit the HubSpot search API.
 */
// `createdate` MUST be in the request: the mirror's `createdAt` column is
// notNull (Drizzle schema), and the executor uses it for every "Created
// in [date range]" query. If we omit it from the property request the
// response lacks `p.createdate`, the upsert falls back to `new Date()`
// (today), and historical records land in the wrong date bucket —
// producing exactly the "queries undercount HubSpot" symptom.
const REQUIRED_DEAL_PROPS = ["hs_lastmodifieddate", "createdate"];
const REQUIRED_CONTACT_PROPS = ["lastmodifieddate", "createdate"];

/**
 * Incremental sync.
 *
 * Cursor logic:
 *   - `forceFull: true` OR no prior sync → cursor = 0 (UNIX epoch) so
 *     HubSpot returns every record (`lastmodifieddate >= 1970-01-01`).
 *     The previous default of `now - 90 days` was lossy: any historical
 *     contact / deal that hadn't been touched in 90 days was invisible
 *     to the mirror, which is the root cause of the
 *     "queries undercount HubSpot" report.
 *   - Subsequent runs → `lastSyncedAt - 10min` (10-minute overlap so a
 *     record modified mid-sync isn't missed when the cursor jumps).
 *
 * `forceFull` is the one-time backfill knob: when the operator clicks
 * "Re-import all data" we wipe the mirror tables and run with
 * cursor=0 to repopulate from scratch.
 */
export async function syncHubspot(
  workspaceId: string,
  opts: { forceFull?: boolean } = {},
) {
  const row = await getHubspotIntegration(workspaceId);
  if (!row) throw new Error("HubSpot is not connected for this workspace.");

  const token = await decryptSecret(row.accessTokenEnc);

  // Full backfill: clear the mirror so we don't leave orphaned rows
  // (records deleted in HubSpot since the last partial sync). The
  // workspace's other tables — owners, dashboards, queries — stay put.
  if (opts.forceFull) {
    await Promise.all([
      db.delete(hubspotDeals).where(eq(hubspotDeals.workspaceId, workspaceId)),
      db.delete(hubspotContacts).where(eq(hubspotContacts.workspaceId, workspaceId)),
    ]);
  }

  const cursorMs =
    opts.forceFull || !row.lastSyncedAt
      ? 0
      : row.lastSyncedAt.getTime() - 10 * 60 * 1000;

  try {
    // Resolve which fields the operator wants synced. The defaults cover
    // the standard set so a freshly-connected workspace still gets data.
    const selection = getHubspotFieldSelection(row);

    // Serialize — HubSpot's per-second search budget is shared across all
    // calls, so paralleling deals + contacts only burns the bucket twice
    // as fast and provokes 429s. Owners uses a non-search endpoint and
    // could run in parallel, but the sequential cost is negligible and
    // keeping it ordered makes the log line `deals → contacts → owners`
    // easy to reason about.
    const dealsCount = await syncDeals(token, workspaceId, cursorMs, selection.deals);
    const contactsCount = await syncContacts(
      token,
      workspaceId,
      cursorMs,
      selection.contacts,
    );
    const ownersCount = await syncOwners(token, workspaceId);

    const recordCount = dealsCount + contactsCount + ownersCount;
    await db
      .update(integrations)
      .set({
        status: "active",
        lastSyncedAt: new Date(),
        lastError: null,
        recordCount,
      })
      .where(eq(integrations.id, row.id));

    return { deals: dealsCount, contacts: contactsCount, owners: ownersCount, recordCount };
  } catch (err) {
    await db
      .update(integrations)
      .set({
        status: "error",
        lastError: {
          at: Date.now(),
          message: err instanceof Error ? err.message : String(err),
        },
      })
      .where(eq(integrations.id, row.id));
    throw err;
  }
}

/**
 * HubSpot Search API caps cursor-based pagination at 10,000 records per
 * filter set. Past 10K the API returns 400. To cover portals with more
 * than 10K modified-since-cursor records we walk `lastmodifieddate` in
 * adaptive windows via recursive bisection: try `[from, to)`; if
 * HubSpot's `total` for the window exceeds the safe limit, halve the
 * window and recurse on each half; otherwise paginate the window
 * normally. Bisection terminates when the window size shrinks below a
 * single millisecond (impossible to have 9500 records in 1ms in
 * practice).
 */
const HUBSPOT_SEARCH_WINDOW_LIMIT = 9500;
const HUBSPOT_SEARCH_MAX_BISECT_DEPTH = 24;

/** Page through deals modified since `cursorMs`, upsert into the mirror. */
async function syncDeals(
  token: string,
  workspaceId: string,
  cursorMs: number,
  picked: HubspotPickedField[],
) {
  // Build the property request list: required + picked. Use a Set for
  // dedup since required props can also be standard picks.
  const { standard, custom } = splitFields(picked, STANDARD_DEAL_PROPS);
  const properties = Array.from(
    new Set([...REQUIRED_DEAL_PROPS, ...standard, ...custom.map((f) => f.name)]),
  );

  let skippedMissingCreate = 0;

  const upsertOne = async (d: { id: string; properties: Record<string, string | null | undefined> }) => {
    const p = d.properties;
    // Defensive: skip records whose createdate didn't come back in
    // the response. `createdate` is now in REQUIRED_DEAL_PROPS so
    // this should be rare, but if HubSpot ever returns a malformed
    // record we'd rather drop it than fabricate `new Date()` and
    // misbucket it in date-filtered queries.
    if (!p.createdate) {
      skippedMissingCreate++;
      return false;
    }
    const customValues = pickCustomValues(p, custom);
    await db
      .insert(hubspotDeals)
      .values({
        workspaceId,
        hsId: d.id,
        name: p.dealname ?? null,
        amount: p.amount ?? null,
        stage: p.dealstage ?? null,
        pipeline: p.pipeline ?? null,
        ownerId: p.hubspot_owner_id ?? null,
        closeDate: p.closedate ? new Date(p.closedate) : null,
        createdAt: new Date(p.createdate),
        updatedAt: p.hs_lastmodifieddate
          ? new Date(p.hs_lastmodifieddate)
          : new Date(),
        customProperties: customValues,
      })
      .onConflictDoUpdate({
        target: [hubspotDeals.workspaceId, hubspotDeals.hsId],
        set: {
          name: p.dealname ?? null,
          amount: p.amount ?? null,
          stage: p.dealstage ?? null,
          pipeline: p.pipeline ?? null,
          ownerId: p.hubspot_owner_id ?? null,
          closeDate: p.closedate ? new Date(p.closedate) : null,
          updatedAt: p.hs_lastmodifieddate
            ? new Date(p.hs_lastmodifieddate)
            : new Date(),
          customProperties: customValues,
          syncedAt: new Date(),
        },
      });
    return true;
  };

  // Walk the window from cursor to "now + 1 day" so we don't miss a
  // record modified between server clocks during the sync.
  await searchWindowed({
    fromMs: cursorMs,
    toMs: Date.now() + 24 * 60 * 60 * 1000,
    lastModField: "hs_lastmodifieddate",
    properties,
    search: (params) =>
      hsFetch<SearchResponse>(
        token,
        "POST",
        "/crm/v3/objects/deals/search",
        params,
      ),
    upsertOne: upsertOne as (r: { id: string; properties: Record<string, string | null | undefined> }) => Promise<boolean>,
  });

  if (skippedMissingCreate > 0) {
    console.warn(
      `[hubspot] syncDeals: skipped ${skippedMissingCreate} deals with no createdate (workspace=${workspaceId})`,
    );
  }

  // Return cumulative count for the workspace, not just this run.
  const r = await db
    .select({ count: sql<number>`count(*)` })
    .from(hubspotDeals)
    .where(eq(hubspotDeals.workspaceId, workspaceId));
  return Number(r[0]?.count ?? 0);
}

async function syncContacts(
  token: string,
  workspaceId: string,
  cursorMs: number,
  picked: HubspotPickedField[],
) {
  const { standard, custom } = splitFields(picked, STANDARD_CONTACT_PROPS);
  const properties = Array.from(
    new Set([...REQUIRED_CONTACT_PROPS, ...standard, ...custom.map((f) => f.name)]),
  );

  let skippedMissingCreate = 0;

  const upsertOne = async (c: { id: string; properties: Record<string, string | null | undefined> }) => {
    const p = c.properties;
    // See syncDeals for why we skip rather than fabricate `new Date()`.
    if (!p.createdate) {
      skippedMissingCreate++;
      return false;
    }
    const customValues = pickCustomValues(p, custom);
    await db
      .insert(hubspotContacts)
      .values({
        workspaceId,
        hsId: c.id,
        email: p.email ?? null,
        ownerId: p.hubspot_owner_id ?? null,
        lifecycleStage: p.lifecyclestage ?? null,
        createdAt: new Date(p.createdate),
        customProperties: customValues,
      })
      .onConflictDoUpdate({
        target: [hubspotContacts.workspaceId, hubspotContacts.hsId],
        set: {
          email: p.email ?? null,
          ownerId: p.hubspot_owner_id ?? null,
          lifecycleStage: p.lifecyclestage ?? null,
          customProperties: customValues,
          syncedAt: new Date(),
        },
      });
    return true;
  };

  await searchWindowed({
    fromMs: cursorMs,
    toMs: Date.now() + 24 * 60 * 60 * 1000,
    lastModField: "lastmodifieddate",
    properties,
    search: (params) =>
      hsFetch<SearchResponse>(
        token,
        "POST",
        "/crm/v3/objects/contacts/search",
        params,
      ),
    upsertOne: upsertOne as (r: { id: string; properties: Record<string, string | null | undefined> }) => Promise<boolean>,
  });

  if (skippedMissingCreate > 0) {
    console.warn(
      `[hubspot] syncContacts: skipped ${skippedMissingCreate} contacts with no createdate (workspace=${workspaceId})`,
    );
  }

  const r = await db
    .select({ count: sql<number>`count(*)` })
    .from(hubspotContacts)
    .where(eq(hubspotContacts.workspaceId, workspaceId));
  return Number(r[0]?.count ?? 0);
}

/**
 * HubSpot Search result row — just enough shape to satisfy the upsert
 * callbacks above. The SDK actually uses `string | null` for property
 * values (a null = property exists but has no value); we accept that
 * here and normalise in the upsert callbacks.
 */
type SearchHit = { id: string; properties: Record<string, string | null | undefined> };

type SearchResponse = {
  total?: number;
  results: SearchHit[];
  paging?: { next?: { after?: string } };
};

type SearchRequest = {
  filterGroups: Array<{
    filters: Array<{ propertyName: string; operator: FilterOperator; value: string }>;
  }>;
  properties: string[];
  sorts: string[];
  limit: number;
  after?: string;
};

/**
 * Walk a `[fromMs, toMs)` window of `lastmodifieddate` and upsert every
 * matching record via `upsertOne`, working around HubSpot's 10K-record
 * pagination ceiling.
 *
 * Algorithm:
 *   1. Ask HubSpot for the first page. It tells us `res.total`.
 *   2. If `total <= 9500`, this window is paginatable end-to-end —
 *      finish it with the normal `after` cursor loop.
 *   3. If `total > 9500`, the window holds too many records for a
 *      single cursor sequence. Bisect by the midpoint timestamp and
 *      recurse on each half. We never call `upsertOne` for the
 *      first-page records here — the recursive halves will re-fetch
 *      them with the narrower filter.
 *   4. Stop bisecting when the window collapses to a single millisecond
 *      (in practice no portal has 9500 records modified in 1 ms) or we
 *      exceed MAX_BISECT_DEPTH (defensive — should never trigger).
 *
 * The depth-limit + minimum-width termination together guarantee the
 * recursion can't loop forever even on a hypothetically pathological
 * portal.
 */
async function searchWindowed(args: {
  fromMs: number;
  toMs: number;
  lastModField: string;
  properties: string[];
  search: (params: SearchRequest) => Promise<SearchResponse>;
  upsertOne: (r: SearchHit) => Promise<boolean>;
  depth?: number;
}): Promise<void> {
  const { fromMs, toMs, lastModField, properties, search, upsertOne } = args;
  const depth = args.depth ?? 0;

  if (toMs <= fromMs) return;

  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const baseParams: SearchRequest = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: lastModField,
            operator: "GTE",
            value: fromIso,
          },
          {
            propertyName: lastModField,
            operator: "LT",
            value: toIso,
          },
        ],
      },
    ],
    properties,
    sorts: [lastModField],
    limit: 100,
  };

  // First probe: peek at `total` so we can decide whether to bisect.
  const probe = await withSearchRateLimit(() => search(baseParams));
  const total = probe.total ?? 0;

  if (total === 0) return;

  // Too many records for a single cursor sequence — bisect and recurse.
  // Skip processing the probe's results here; the recursive halves
  // will re-fetch them with the narrower filter (no double-counting
  // because upserts are idempotent by (workspaceId, hsId) anyway).
  if (total > HUBSPOT_SEARCH_WINDOW_LIMIT) {
    if (toMs - fromMs <= 1 || depth >= HUBSPOT_SEARCH_MAX_BISECT_DEPTH) {
      // Can't bisect further — process what we can (up to the 10K
      // cap) and accept that anything past 10K in this 1ms slice
      // will be missed. Effectively unreachable in practice.
      console.warn(
        `[hubspot] searchWindowed: cannot bisect [${fromIso}, ${toIso}); total=${total} (workspace records may be undercount)`,
      );
    } else {
      const midMs = Math.floor((fromMs + toMs) / 2);
      await searchWindowed({ ...args, fromMs, toMs: midMs, depth: depth + 1 });
      await searchWindowed({ ...args, fromMs: midMs, toMs, depth: depth + 1 });
      return;
    }
  }

  // Window fits — process the probe's first page, then paginate the
  // rest with `after`.
  for (const hit of probe.results) {
    await upsertOne(hit);
  }
  let after = probe.paging?.next?.after;
  while (after) {
    const res = await withSearchRateLimit(() =>
      search({ ...baseParams, after }),
    );
    for (const hit of res.results) {
      await upsertOne(hit);
    }
    after = res.paging?.next?.after;
  }
}

/**
 * Pluck the custom-property values from a HubSpot result row into the
 * shape we persist on the mirror (`Record<propName, value | null>`).
 *
 * Returns `null` instead of an empty object when nothing was picked, so
 * the DB stores `NULL` and queries can `WHERE custom_properties IS NOT NULL`
 * cheaply.
 */
function pickCustomValues(
  resultProps: Record<string, string | null | undefined>,
  custom: HubspotPickedField[],
): Record<string, string | null> | null {
  if (custom.length === 0) return null;
  const out: Record<string, string | null> = {};
  for (const f of custom) {
    const v = resultProps[f.name];
    out[f.name] = v === undefined || v === null || v === "" ? null : v;
  }
  return out;
}

/**
 * Owners is a tiny set (sales team size), so we full-sync each run rather
 * than paginate cleverly.
 */
async function syncOwners(token: string, workspaceId: string) {
  type Owner = {
    id?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  const res = await hsFetch<{ results: Owner[] }>(
    token,
    "GET",
    "/crm/v3/owners?limit=100",
  );
  for (const o of res.results) {
    if (!o.id) continue;
    await db
      .insert(hubspotOwners)
      .values({
        workspaceId,
        hsId: o.id,
        email: o.email ?? null,
        firstName: o.firstName ?? null,
        lastName: o.lastName ?? null,
      })
      .onConflictDoUpdate({
        target: [hubspotOwners.workspaceId, hubspotOwners.hsId],
        set: {
          email: o.email ?? null,
          firstName: o.firstName ?? null,
          lastName: o.lastName ?? null,
          syncedAt: new Date(),
        },
      });
  }
  return res.results.length;
}
