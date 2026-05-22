/**
 * Query AST — Phase 2 slices 4–5.
 *
 * Three kinds today:
 *   - single     → one aggregated value
 *   - timeseries → bucketed values over time (optionally with previous period)
 *   - groupby    → top-N by a grouping column, e.g. revenue per owner
 *
 * Funnel lands when the multi-stage configurator UI ships (slice 6+).
 *
 * Validated with Zod at every entry point so we never trust unchecked JSON
 * from the DB or HTTP boundary.
 */
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Date ranges + buckets
// ─────────────────────────────────────────────────────────────────────────────

export const DATE_RANGES = [
  "today",
  "yesterday",
  "this-week",
  "last-7-days",
  "this-month",
  "last-30-days",
  "this-quarter",
  "this-year",
  "all-time",
] as const;

export type DateRange = (typeof DATE_RANGES)[number];
export const dateRangeSchema = z.enum(DATE_RANGES);

export const BUCKETS = ["day", "week", "month"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const bucketSchema = z.enum(BUCKETS);

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

export const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "neq", "in", "gte", "lte"]),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
});

export type Filter = z.infer<typeof filterSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Sources + shared shape
// ─────────────────────────────────────────────────────────────────────────────

export const SOURCES = ["stripe", "hubspot"] as const;
export type Source = (typeof SOURCES)[number];

const sharedFields = {
  source: z.enum(SOURCES),
  metric: z.string(),
  filters: z.array(filterSchema),
  dateRange: dateRangeSchema,
};

// ─────────────────────────────────────────────────────────────────────────────
// Kind: single
// ─────────────────────────────────────────────────────────────────────────────

export const singleQuerySchema = z.object({
  kind: z.literal("single"),
  ...sharedFields,
});
export type SingleQuery = z.infer<typeof singleQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Kind: timeseries
// ─────────────────────────────────────────────────────────────────────────────

export const timeseriesQuerySchema = z.object({
  kind: z.literal("timeseries"),
  ...sharedFields,
  bucket: bucketSchema,
  /** Run a second pass for the same-length previous window and zip results. */
  comparePrev: z.boolean().optional(),
});
export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Kind: groupby
// ─────────────────────────────────────────────────────────────────────────────

export const groupByQuerySchema = z.object({
  kind: z.literal("groupby"),
  ...sharedFields,
  /** Column on the metric's table — owner_id, customer_id, stage, etc. */
  groupBy: z.string().min(1),
  /** Top-N cap; default 10 enforced by the executor. */
  limit: z.number().int().positive().max(50).optional(),
});
export type GroupByQuery = z.infer<typeof groupByQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Top-level discriminated union
// ─────────────────────────────────────────────────────────────────────────────

export const queryConfigSchema = z.discriminatedUnion("kind", [
  singleQuerySchema,
  timeseriesQuerySchema,
  groupByQuerySchema,
]);

export type QueryConfig = z.infer<typeof queryConfigSchema>;
export type QueryKind = QueryConfig["kind"];
