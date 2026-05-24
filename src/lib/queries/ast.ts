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

/**
 * Filter ops mirror the Plecto-style operator picker:
 *
 *   eq / neq                   → is / is not             (single value)
 *   in / nin                   → is any of / is none of  (array value)
 *   gte / lte                  → numeric thresholds      (single value)
 *   known / unknown            → IS NOT NULL / IS NULL   (no value)
 *
 * `known` / `unknown` ignore the `value` field; the wizard hides the value
 * input when those operators are picked.
 */
export const FILTER_OPS = [
  "eq",
  "neq",
  "in",
  "nin",
  "gte",
  "lte",
  "known",
  "unknown",
] as const;

export type FilterOp = (typeof FILTER_OPS)[number];

export const FILTER_OP_LABEL: Record<FilterOp, string> = {
  eq: "is",
  neq: "is not",
  in: "is any of",
  nin: "is none of",
  gte: "is at least",
  lte: "is at most",
  known: "is known",
  unknown: "is unknown",
};

/** True when the operator doesn't take a value (known / unknown). */
export function opIsUnary(op: FilterOp): boolean {
  return op === "known" || op === "unknown";
}

/** True when the operator takes an array of values (in / nin). */
export function opIsMultiValue(op: FilterOp): boolean {
  return op === "in" || op === "nin";
}

export const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(FILTER_OPS),
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.array(z.number()),
    ])
    .optional(),
});

export type Filter = z.infer<typeof filterSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Output formatting + conditional colors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How the widget renderer should format the result. Stored on the query
 * so it travels with the data, not the widget. A widget can still
 * override per-display when needed.
 */
export const OUTPUT_FORMATS = [
  "number",
  "currency",
  "percent",
  "yesno",
  "durationDays",
] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const OUTPUT_FORMAT_LABEL: Record<OutputFormat, string> = {
  number: "Number",
  currency: "Currency (€)",
  percent: "Percentage",
  yesno: "Yes / No",
  durationDays: "Duration (days)",
};

export const outputFormatSchema = z.enum(OUTPUT_FORMATS);

/**
 * Three-stop conditional color spec.
 *
 * The value is bucketed by *percentage of target* (or absolute value when
 * no target is set) and rendered in the matching color. Thresholds are
 * percentage breakpoints between the three colors; the second threshold
 * must be ≥ the first.
 *
 *   value ≤ thresholds[0]               → color = colors[0]
 *   thresholds[0] < value ≤ thresholds[1] → color = colors[1]
 *   value > thresholds[1]               → color = colors[2]
 */
export const conditionalColorsSchema = z.object({
  /** Hex strings — e.g. "#E53935". The wizard exposes a small palette. */
  colors: z.tuple([z.string(), z.string(), z.string()]),
  /** Percentage breakpoints, 0–200 typically. */
  thresholds: z.tuple([z.number(), z.number()]),
});

export type ConditionalColors = z.infer<typeof conditionalColorsSchema>;

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
  /** Override the metric's default date column. Optional; defaults inferred per metric. */
  dateField: z.string().optional(),
  /** Presentation hint for renderers; widgets honour this when set. */
  outputFormat: outputFormatSchema.optional(),
  /** Optional 3-stop conditional color palette. */
  conditionalColors: conditionalColorsSchema.optional(),
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
