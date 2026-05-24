/**
 * Query executor — compiles a `QueryConfig` to Drizzle SQL and returns a
 * shape-aware result.
 *
 *   single     → one aggregated value
 *   timeseries → bucketed values over time (optional previous-period zip)
 *   groupby    → top-N rows grouped by a column (optional label join)
 */
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  not,
  sql,
  type SQL,
  type Column,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  differenceInDays,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfToday,
  startOfWeek,
  startOfYear,
  startOfYesterday,
  endOfYesterday,
  subDays,
  subMilliseconds,
} from "date-fns";
import { db } from "@/lib/db";
import { fmtEUR, fmtInt, fmtPct } from "@/lib/format";
import { hubspotContacts, hubspotDeals, hubspotOwners } from "@/lib/db/schema";
import {
  METRICS_BY_ID,
  type Aggregation,
  type MetricDef,
  metricGroupByOptions,
} from "./metrics";
import {
  queryConfigSchema,
  type Bucket,
  type Filter,
  type GroupByQuery,
  type QueryConfig,
  type SingleQuery,
  type TimeseriesQuery,
} from "./ast";

// ─────────────────────────────────────────────────────────────────────────────
// Result types — shape-aware union surfaced to callers
// ─────────────────────────────────────────────────────────────────────────────

export type FormatterKind = MetricDef["unit"];

export type ExecutorResult =
  | {
      kind: "single";
      value: number | null;
      formatted: string | null;
      formatter: FormatterKind;
      ms: number;
    }
  | {
      kind: "timeseries";
      points: Array<{ label: string; value: number; prev?: number }>;
      formatter: FormatterKind;
      ms: number;
    }
  | {
      kind: "groupby";
      rows: Array<{ key: string; label?: string; value: number }>;
      formatter: FormatterKind;
      ms: number;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Date range expansion
// ─────────────────────────────────────────────────────────────────────────────

function rangeToWindow(range: SingleQuery["dateRange"]): {
  from: Date | null;
  to: Date | null;
} {
  const now = new Date();
  switch (range) {
    case "today":
      return { from: startOfToday(), to: now };
    case "yesterday":
      return { from: startOfYesterday(), to: endOfYesterday() };
    case "this-week":
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case "last-7-days":
      return { from: startOfDay(subDays(now, 7)), to: now };
    case "this-month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "last-30-days":
      return { from: startOfDay(subDays(now, 30)), to: now };
    case "this-quarter":
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "this-year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "all-time":
      return { from: null, to: null };
  }
}

/** Previous window of the same length, ending just before `from`. */
function previousWindow(window: { from: Date | null; to: Date | null }) {
  if (!window.from || !window.to) return { from: null, to: null };
  const length = window.to.getTime() - window.from.getTime();
  const prevTo = subMilliseconds(window.from, 1);
  const prevFrom = subMilliseconds(prevTo, length);
  return { from: prevFrom, to: prevTo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation + filter compilation
// ─────────────────────────────────────────────────────────────────────────────

function aggregationExpr(
  metric: MetricDef,
  table: Record<string, unknown>,
): SQL<number> {
  const agg: Aggregation = metric.aggregation;
  if (agg === "count") return sql<number>`COUNT(*)`;
  if (!metric.column) {
    throw new Error(`Metric ${metric.id} requires a column for ${agg}.`);
  }

  // Custom-field sentinel: column = "custom:<propName>". Build a
  // CAST(json_extract(custom_properties, '$.<propName>') AS REAL)
  // expression so the aggregation runs over JSON-stored numbers.
  if (metric.column.startsWith("custom:")) {
    const propName = metric.column.slice("custom:".length);
    const jsonCol = table.customProperties as Column | undefined;
    if (!jsonCol) {
      throw new Error(
        `Custom aggregation needs custom_properties on table for metric ${metric.id}.`,
      );
    }
    const numExpr = sql<number>`CAST(json_extract(${jsonCol}, ${"$." + propName}) AS REAL)`;
    switch (agg) {
      case "sum":
        return sql<number>`COALESCE(SUM(${numExpr}), 0)`;
      case "avg":
        return sql<number>`COALESCE(AVG(${numExpr}), 0)`;
      case "min":
        return sql<number>`COALESCE(MIN(${numExpr}), 0)`;
      case "max":
        return sql<number>`COALESCE(MAX(${numExpr}), 0)`;
      case "count_distinct":
        return sql<number>`COUNT(DISTINCT json_extract(${jsonCol}, ${"$." + propName}))`;
    }
  }

  const col = table[metric.column] as Column | undefined;
  if (!col) {
    throw new Error(`Column ${metric.column} not found on metric table.`);
  }
  switch (agg) {
    case "sum":
      // HubSpot deal amounts are stored as text — cast for arithmetic.
      return metric.unit === "EUR"
        ? sql<number>`COALESCE(SUM(CAST(${col} AS REAL)), 0)`
        : sql<number>`COALESCE(SUM(${col}), 0)`;
    case "avg":
      return sql<number>`COALESCE(AVG(${col}), 0)`;
    case "min":
      return sql<number>`COALESCE(MIN(${col}), 0)`;
    case "max":
      return sql<number>`COALESCE(MAX(${col}), 0)`;
    case "count_distinct":
      return sql<number>`COUNT(DISTINCT ${col})`;
  }
}

function coerce(value: Filter["value"]): unknown {
  // Unary operators (known / unknown) never reach this path — but guard
  // anyway so a malformed binary filter throws a clean error rather than
  // a NPE downstream.
  if (value === undefined) {
    throw new Error("Filter value is required for this operator.");
  }
  if (Array.isArray(value)) return value.map((v) => coerceScalar(v));
  return coerceScalar(value as string | number | boolean);
}

function coerceScalar(v: string | number | boolean): unknown {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function compileFilter(
  metric: MetricDef,
  table: Record<string, unknown>,
  f: Filter,
): SQL | undefined {
  // Custom-field path: the wizard encodes JSON-backed fields as
  // `custom:propName`. We resolve to a `json_extract(custom_properties,
  // '$.propName')` expression and run the operator against that.
  if (f.field.startsWith("custom:")) {
    const propName = f.field.slice("custom:".length);
    const jsonCol = table.customProperties as SQLiteColumn | undefined;
    if (!jsonCol) {
      throw new Error(
        `Custom field "${propName}" requested but metric "${metric.id}" has no custom_properties column.`,
      );
    }
    const expr = sql`json_extract(${jsonCol}, ${"$." + propName})`;
    if (f.op === "known") return sql`${expr} IS NOT NULL`;
    if (f.op === "unknown") return sql`${expr} IS NULL`;
    const v = coerce(f.value);
    switch (f.op) {
      case "eq":
        return sql`${expr} = ${v}`;
      case "neq":
        return sql`${expr} != ${v}`;
      case "gte":
        return sql`CAST(${expr} AS REAL) >= ${v}`;
      case "lte":
        return sql`CAST(${expr} AS REAL) <= ${v}`;
      case "in":
        if (!Array.isArray(v)) {
          throw new Error(`Filter "${f.field}" op=in requires an array value.`);
        }
        return sql`${expr} IN ${v}`;
      case "nin":
        if (!Array.isArray(v)) {
          throw new Error(`Filter "${f.field}" op=nin requires an array value.`);
        }
        return sql`${expr} NOT IN ${v}`;
    }
  }

  // Standard column path.
  const col = table[f.field] as SQLiteColumn | undefined;
  if (!col) {
    throw new Error(`Filter field "${f.field}" not on metric "${metric.id}".`);
  }
  if (f.op === "known") return isNotNull(col);
  if (f.op === "unknown") return isNull(col);

  const v = coerce(f.value);
  switch (f.op) {
    case "eq":
      return eq(col, v as never);
    case "neq":
      return ne(col, v as never);
    case "gte":
      return gte(col, v as never);
    case "lte":
      return lt(col, v as never);
    case "in":
      if (!Array.isArray(v)) {
        throw new Error(`Filter "${f.field}" op=in requires an array value.`);
      }
      return inArray(col, v as never[]);
    case "nin":
      if (!Array.isArray(v)) {
        throw new Error(`Filter "${f.field}" op=nin requires an array value.`);
      }
      return not(inArray(col, v as never[]));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bucketing — SQLite date functions over integer-timestamp columns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns an SQL expression that buckets the metric's date column to the
 * requested grain. Our integer columns are stored as unix seconds, so we
 * pass `'unixepoch'` to SQLite's date functions.
 */
function bucketExpression(dateCol: SQLiteColumn, bucket: Bucket): SQL<string> {
  switch (bucket) {
    case "day":
      return sql<string>`date(${dateCol}, 'unixepoch')`;
    case "week":
      // Monday-anchored ISO-style label: yyyy-Www (zero-padded). SQLite's
      // %W is 0..53 weeks since the first Monday — close enough for chart
      // labels.
      return sql<string>`strftime('%Y-W%W', ${dateCol}, 'unixepoch')`;
    case "month":
      return sql<string>`strftime('%Y-%m', ${dateCol}, 'unixepoch')`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single
// ─────────────────────────────────────────────────────────────────────────────

async function runSingle(
  workspaceId: string,
  config: SingleQuery,
  opts: RunQueryOptions = {},
): Promise<ExecutorResult> {
  const metric = resolveMetric(config.metric, config.source);
  const table = metric.table as unknown as Record<string, unknown>;
  const workspaceCol = table.workspaceId as SQLiteColumn;
  const dateFieldName = config.dateField ?? metric.dateField;
  const dateCol = resolveDateColumn(table, dateFieldName) as SQLiteColumn | undefined;
  if (!dateCol) {
    throw new Error(`Date column ${dateFieldName} missing on metric table.`);
  }

  // Widget-level time-period override beats the query's own dateRange.
  // See `RunQueryOptions.dateOverride` for the contract.
  const window = opts.dateOverride ?? rangeToWindow(config.dateRange);
  const conditions: SQL[] = [eq(workspaceCol, workspaceId)];
  if (window.from) conditions.push(gte(dateCol, window.from));
  if (window.to) conditions.push(lt(dateCol, window.to));
  for (const f of config.filters) {
    const s = compileFilter(metric, table, f);
    if (s) conditions.push(s);
  }

  const start = performance.now();
  const rows = await db
    .select({ v: aggregationExpr(metric, table) })
    .from(metric.table)
    .where(and(...conditions));
  const ms = Math.round(performance.now() - start);

  const value = Number(rows[0]?.v ?? 0);
  return {
    kind: "single",
    value,
    formatted: formatScalar(metric, value),
    formatter: metric.unit,
    ms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeseries
// ─────────────────────────────────────────────────────────────────────────────

async function runTimeseries(
  workspaceId: string,
  config: TimeseriesQuery,
  opts: RunQueryOptions = {},
): Promise<ExecutorResult> {
  const metric = resolveMetric(config.metric, config.source);
  const table = metric.table as unknown as Record<string, unknown>;
  const workspaceCol = table.workspaceId as SQLiteColumn;
  const dateFieldName = config.dateField ?? metric.dateField;
  const dateCol = resolveDateColumn(table, dateFieldName) as SQLiteColumn | undefined;
  if (!dateCol) {
    throw new Error(`Date column ${dateFieldName} missing on metric table.`);
  }

  const window = opts.dateOverride ?? rangeToWindow(config.dateRange);
  const start = performance.now();
  const current = await fetchBucketRows(workspaceId, metric, table, workspaceCol, dateCol, window, config);

  let prevMap: Map<string, number> | null = null;
  if (config.comparePrev && window.from && window.to) {
    const prev = await fetchBucketRows(
      workspaceId,
      metric,
      table,
      workspaceCol,
      dateCol,
      previousWindow(window),
      config,
    );
    // Zip by offset within the window (week 1 of current vs week 1 of prev),
    // since the labels differ.
    prevMap = new Map();
    prev.forEach((r, i) => {
      const label = current[i]?.bucket;
      if (label) prevMap!.set(label, Number(r.v));
    });
  }
  const ms = Math.round(performance.now() - start);

  return {
    kind: "timeseries",
    points: current.map((r) => ({
      label: r.bucket,
      value: Number(r.v),
      prev: prevMap?.get(r.bucket),
    })),
    formatter: metric.unit,
    ms,
  };
}

async function fetchBucketRows(
  workspaceId: string,
  metric: MetricDef,
  table: Record<string, unknown>,
  workspaceCol: SQLiteColumn,
  dateCol: SQLiteColumn,
  window: { from: Date | null; to: Date | null },
  config: TimeseriesQuery,
) {
  const bucketExpr = bucketExpression(dateCol, config.bucket);
  const conditions: SQL[] = [eq(workspaceCol, workspaceId)];
  if (window.from) conditions.push(gte(dateCol, window.from));
  if (window.to) conditions.push(lt(dateCol, window.to));
  for (const f of config.filters) {
    const s = compileFilter(metric, table, f);
    if (s) conditions.push(s);
  }
  return db
    .select({ bucket: bucketExpr, v: aggregationExpr(metric, table) })
    .from(metric.table)
    .where(and(...conditions))
    .groupBy(bucketExpr)
    .orderBy(asc(bucketExpr));
}

// ─────────────────────────────────────────────────────────────────────────────
// Group by
// ─────────────────────────────────────────────────────────────────────────────

async function runGroupBy(
  workspaceId: string,
  config: GroupByQuery,
  opts: RunQueryOptions = {},
): Promise<ExecutorResult> {
  const metric = resolveMetric(config.metric, config.source);
  const table = metric.table as unknown as Record<string, unknown>;
  const workspaceCol = table.workspaceId as SQLiteColumn;
  const dateFieldName = config.dateField ?? metric.dateField;
  const dateCol = resolveDateColumn(table, dateFieldName) as SQLiteColumn | undefined;
  if (!dateCol) {
    throw new Error(`Date column ${dateFieldName} missing on metric table.`);
  }
  const groupCol = table[config.groupBy] as SQLiteColumn | undefined;
  if (!groupCol) {
    throw new Error(
      `Group-by field "${config.groupBy}" not on metric "${metric.id}".`,
    );
  }

  const window = opts.dateOverride ?? rangeToWindow(config.dateRange);
  const conditions: SQL[] = [eq(workspaceCol, workspaceId)];
  if (window.from) conditions.push(gte(dateCol, window.from));
  if (window.to) conditions.push(lt(dateCol, window.to));
  for (const f of config.filters) {
    const s = compileFilter(metric, table, f);
    if (s) conditions.push(s);
  }

  const limit = Math.min(config.limit ?? 10, 50);

  const start = performance.now();
  const rows = await db
    .select({ key: groupCol, v: aggregationExpr(metric, table) })
    .from(metric.table)
    .where(and(...conditions))
    .groupBy(groupCol)
    .orderBy(desc(aggregationExpr(metric, table)))
    .limit(limit);
  const ms = Math.round(performance.now() - start);

  // Optional label join — currently the only mapped one is hubspot owners.
  const opt = metricGroupByOptions(metric.id).find((o) => o.field === config.groupBy);
  let labelMap: Map<string, string> | null = null;
  if (opt?.labelFrom?.table === "hubspot_owners") {
    const keys = rows
      .map((r) => r.key)
      .filter((k): k is string => typeof k === "string" && k.length > 0);
    if (keys.length > 0) {
      const owners = await db
        .select({
          hsId: hubspotOwners.hsId,
          email: hubspotOwners.email,
          firstName: hubspotOwners.firstName,
          lastName: hubspotOwners.lastName,
        })
        .from(hubspotOwners)
        .where(
          and(
            eq(hubspotOwners.workspaceId, workspaceId),
            inArray(hubspotOwners.hsId, keys),
          ),
        );
      labelMap = new Map(
        owners.map((o) => [
          o.hsId,
          [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || o.hsId,
        ]),
      );
    }
  }

  return {
    kind: "groupby",
    rows: rows.map((r) => {
      const key = typeof r.key === "string" ? r.key : String(r.key ?? "—");
      return {
        key,
        label: labelMap?.get(key),
        value: Number(r.v ?? 0),
      };
    }),
    formatter: metric.unit,
    ms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveMetric(id: string, source: string): MetricDef {
  // Synthetic metric for custom-field aggregations. Format:
  //   `__custom:<source>:<object>:<aggregation>:<fieldName>`
  // e.g. `__custom:hubspot:deals:sum:annual_recurring_revenue`
  //
  // The wizard mints these for custom numeric fields the operator
  // picked in /integrations. We resolve to a MetricDef on the fly
  // pointing at the right mirror table; `column` is a sentinel
  // (`custom:<fieldName>`) that compileAgg + filter both special-case.
  if (id.startsWith("__custom:")) {
    return buildCustomMetric(id);
  }
  const metric = METRICS_BY_ID.get(id);
  if (!metric) throw new Error(`Unknown metric: ${id}`);
  if (metric.source !== source) {
    throw new Error(`Metric "${id}" is not from source "${source}".`);
  }
  return metric;
}

/**
 * Resolve a date-field name to a SQL expression usable in WHERE / GROUP BY.
 *
 * Standard names map to the matching Drizzle column. Custom-field names
 * are encoded as `custom:propName` and resolve to a
 * `datetime(json_extract(custom_properties, '$.propName'))` expression
 * so range filtering still works on JSON-stored ISO timestamps.
 */
function resolveDateColumn(
  table: Record<string, unknown>,
  name: string,
): unknown {
  if (name.startsWith("custom:")) {
    const propName = name.slice("custom:".length);
    const jsonCol = table.customProperties as SQLiteColumn | undefined;
    if (!jsonCol) return undefined;
    // Wrap in `datetime(...)` so SQLite parses HubSpot's ISO 8601
    // string and supports the same `>=` / `<` comparators we use
    // against the real timestamp columns.
    return sql`datetime(json_extract(${jsonCol}, ${"$." + propName}))`;
  }
  return table[name];
}

function buildCustomMetric(id: string): MetricDef {
  const [, src, obj, agg, ...rest] = id.split(":");
  const fieldName = rest.join(":"); // tolerate ':' in property names
  if (!src || !obj || !agg || !fieldName) {
    throw new Error(`Malformed custom metric id: ${id}`);
  }
  if (src !== "hubspot") {
    throw new Error(`Custom aggregation not supported for source "${src}" yet.`);
  }
  if (
    agg !== "sum" &&
    agg !== "avg" &&
    agg !== "min" &&
    agg !== "max" &&
    agg !== "count"
  ) {
    throw new Error(`Custom aggregation "${agg}" is not supported.`);
  }
  return {
    id,
    source: "hubspot",
    label: `Custom · ${fieldName}`,
    description: `Operator-defined HubSpot ${obj} property aggregated as ${agg}.`,
    table: obj === "deals" ? hubspotDeals : hubspotContacts,
    // Sentinel — compileAgg checks for the prefix and emits a
    // CAST(json_extract(custom_properties, '$.fieldName') AS REAL)
    // expression instead of selecting the column directly.
    column: `custom:${fieldName}`,
    aggregation: agg as Aggregation,
    unit: agg === "count" ? "count" : "EUR",
    dateField: obj === "deals" ? "closeDate" : "createdAt",
  };
}

export function formatScalar(metric: { unit: FormatterKind }, raw: number): string {
  switch (metric.unit) {
    case "EUR-cents":
      return fmtEUR(raw / 100);
    case "EUR":
      return fmtEUR(raw);
    case "percent":
      return fmtPct(raw, 1);
    case "count":
    default:
      return fmtInt(Math.round(raw));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export type RunQueryOptions = {
  /**
   * Per-widget date-window override. Takes precedence over the query's
   * `dateRange` when present — used when a widget has its own
   * `display.timePeriod` (e.g. one tile shows "Current Month" while
   * the rest of the dashboard follows whatever the queries default to).
   */
  dateOverride?: { from: Date | null; to: Date | null };
};

export async function runQuery(
  workspaceId: string,
  rawConfig: QueryConfig,
  opts: RunQueryOptions = {},
): Promise<ExecutorResult> {
  const config = queryConfigSchema.parse(rawConfig);
  switch (config.kind) {
    case "single":
      return runSingle(workspaceId, config, opts);
    case "timeseries":
      return runTimeseries(workspaceId, config, opts);
    case "groupby":
      return runGroupBy(workspaceId, config, opts);
  }
}

// Re-export differenceInDays so callers don't pull date-fns twice; not used
// internally yet but slice 6 will (rolling windows).
export { differenceInDays };
