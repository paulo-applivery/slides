/**
 * Client-safe slice of the metrics catalog — strips Drizzle table refs so
 * we don't drag the DB into the client bundle.
 */
import {
  METRICS,
  metricFilters,
  metricGroupByOptions,
  type Aggregation,
  type FilterOption,
  type GroupByOption,
} from "./metrics";
import type { Source } from "./ast";

export type ClientMetric = {
  id: string;
  source: Source;
  label: string;
  description: string;
  unit: "EUR-cents" | "EUR" | "count" | "percent";
  filters: FilterOption[];
  groupByOptions: GroupByOption[];
};

export const CLIENT_METRICS: ClientMetric[] = METRICS.map((m) => ({
  id: m.id,
  source: m.source,
  label: m.label,
  description: m.description,
  unit: m.unit,
  filters: metricFilters(m.id),
  groupByOptions: metricGroupByOptions(m.id),
}));

export function clientMetricsForSource(source: Source): ClientMetric[] {
  return CLIENT_METRICS.filter((m) => m.source === source);
}

// ─────────────────────────────────────────────────────────────────────────────
// Field catalog — for the new aggregation + field UI (Step 3 in the wizard).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A field on a data source the operator can aggregate or filter against.
 *
 *  - `numeric` and `currency` fields can be Sum / Avg / Max / Min targets
 *  - `count` is a sentinel for `COUNT(*)` — no field needed
 *  - `enum` / `string` / `boolean` / `date` are filter-only (today)
 */
export type FieldType =
  | "numeric"
  | "currency"
  | "count"
  | "enum"
  | "string"
  | "boolean"
  | "date";

export type SourceField = {
  /** Column name on the underlying table (must match Drizzle schema). */
  id: string;
  source: Source;
  label: string;
  type: FieldType;
  /** When set, the metric_id to use when the operator picks this field
   *  + aggregation. Lets us keep the executor metric-id-based for now. */
  metricId?: string;
  /** Filter-friendly enum values, when applicable. */
  enumValues?: Array<{ value: string; label: string }>;
};

/**
 * Pre-curated list. Mirrors what the existing METRICS catalog already
 * exposes — but flattened so the wizard can talk in (aggregation, field)
 * tuples instead of pre-composed metric ids.
 */
export const SOURCE_FIELDS: SourceField[] = [
  // Stripe — charges
  {
    id: "amount",
    source: "stripe",
    label: "Charge amount (€)",
    type: "currency",
    metricId: "stripe.charge.sum_amount",
  },
  {
    id: "count",
    source: "stripe",
    label: "Charge count",
    type: "count",
    metricId: "stripe.charge.count",
  },
  {
    id: "customerId",
    source: "stripe",
    label: "Distinct customers",
    type: "count",
    metricId: "stripe.charge.distinct_customers",
  },
  {
    id: "status",
    source: "stripe",
    label: "Status",
    type: "enum",
    enumValues: [
      { value: "succeeded", label: "Succeeded" },
      { value: "pending", label: "Pending" },
      { value: "failed", label: "Failed" },
    ],
  },
  {
    id: "paid",
    source: "stripe",
    label: "Paid",
    type: "boolean",
  },

  // HubSpot — deals
  {
    id: "amount",
    source: "hubspot",
    label: "Deal amount (€)",
    type: "currency",
    metricId: "hubspot.deal.sum_amount",
  },
  {
    id: "count",
    source: "hubspot",
    label: "Deal count",
    type: "count",
    metricId: "hubspot.deal.count",
  },
  {
    id: "stage",
    source: "hubspot",
    label: "Deal stage",
    type: "enum",
    enumValues: [
      { value: "appointmentscheduled", label: "Appointment scheduled" },
      { value: "qualifiedtobuy", label: "Qualified to buy" },
      { value: "presentationscheduled", label: "Presentation scheduled" },
      { value: "decisionmakerboughtin", label: "Decision-maker bought in" },
      { value: "contractsent", label: "Contract sent" },
      { value: "closedwon", label: "Closed won" },
      { value: "closedlost", label: "Closed lost" },
    ],
  },
  {
    id: "pipeline",
    source: "hubspot",
    label: "Pipeline",
    type: "string",
  },
  {
    id: "ownerId",
    source: "hubspot",
    label: "Deal owner",
    type: "string",
  },
];

export function fieldsForSource(source: Source, types?: FieldType[]): SourceField[] {
  const filtered = SOURCE_FIELDS.filter((f) => f.source === source);
  if (!types) return filtered;
  return filtered.filter((f) => types.includes(f.type));
}

// ─────────────────────────────────────────────────────────────────────────────
// Date fields per source — Step 5 of the wizard.
// ─────────────────────────────────────────────────────────────────────────────

export type DateFieldOption = { id: string; source: Source; label: string };

export const DATE_FIELDS: DateFieldOption[] = [
  { id: "occurredAt", source: "stripe", label: "Charge occurred at" },
  { id: "closeDate", source: "hubspot", label: "Deal close date" },
  { id: "createdAt", source: "hubspot", label: "Created date" },
];

export function dateFieldsForSource(source: Source): DateFieldOption[] {
  return DATE_FIELDS.filter((d) => d.source === source);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation labels + resolver
// ─────────────────────────────────────────────────────────────────────────────

/** Aggregations exposed in the wizard. `count_distinct` stays catalog-only. */
export const WIZARD_AGGREGATIONS = [
  "sum",
  "avg",
  "min",
  "max",
  "count",
] as const;

export type WizardAggregation = (typeof WIZARD_AGGREGATIONS)[number];

export const AGGREGATION_LABEL: Record<WizardAggregation, string> = {
  sum: "Sum of",
  avg: "Average of",
  min: "Minimum of",
  max: "Maximum of",
  count: "Count of",
};

/**
 * Resolve a `(source, aggregation, fieldId)` tuple to a `metric_id`
 * registered in METRICS. Returns null when no compatible metric exists
 * (e.g. user picked Avg of a non-numeric field).
 */
export function findMetricId(
  source: Source,
  agg: Aggregation,
  fieldId: string,
): string | null {
  for (const m of METRICS) {
    if (m.source !== source) continue;
    if (m.aggregation !== agg) continue;
    // Count metrics: any column-less metric matches.
    if (agg === "count" && !m.column) return m.id;
    if (agg === "count_distinct" && m.column === fieldId) return m.id;
    if (m.column === fieldId) return m.id;
  }
  return null;
}

/**
 * Client-safe inversion of METRICS used by the edit-mode wizard to
 * decompose a saved `metric_id` back into the (aggregation, field)
 * combo the operator originally picked.
 *
 * Strips the Drizzle table ref so this is safe to import on the client.
 */
export const CLIENT_METRIC_INDEX: ReadonlyArray<{
  id: string;
  source: Source;
  aggregation: WizardAggregation;
  /** The field-id the wizard renders in Step 3 ("amount" / "count" / etc.). */
  column: string;
}> = METRICS.map((m) => ({
  id: m.id,
  source: m.source,
  aggregation: (m.aggregation === "count_distinct"
    ? "count"
    : (m.aggregation as WizardAggregation)),
  column: m.column ?? "count",
}));
