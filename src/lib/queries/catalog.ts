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

/**
 * Within a source, the operator may need to pick which *object* to
 * aggregate over — HubSpot has both Deals and Contacts; Stripe today is
 * just Charges (implicit). The wizard surfaces an Object selector
 * whenever a source has more than one possibility.
 */
export type HubspotObject = "deals" | "contacts";
export type SourceObject = HubspotObject | "charges";

export type SourceField = {
  /** Column name on the underlying table (must match Drizzle schema). */
  id: string;
  source: Source;
  /**
   * Which object on the source this field belongs to. Hubspot fields
   * carry `"deals"` or `"contacts"`; Stripe fields carry `"charges"`.
   * Used by `fieldsForSource(source, types, object?)` so the wizard
   * doesn't show deal-only fields when the operator picked Contacts.
   */
  object: SourceObject;
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
    object: "charges",
    label: "Charge amount (€)",
    type: "currency",
    metricId: "stripe.charge.sum_amount",
  },
  {
    id: "count",
    source: "stripe",
    object: "charges",
    label: "Charge count",
    type: "count",
    metricId: "stripe.charge.count",
  },
  {
    id: "customerId",
    source: "stripe",
    object: "charges",
    label: "Distinct customers",
    type: "count",
    metricId: "stripe.charge.distinct_customers",
  },
  {
    id: "status",
    source: "stripe",
    object: "charges",
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
    object: "charges",
    label: "Paid",
    type: "boolean",
  },

  // HubSpot — deals
  {
    id: "amount",
    source: "hubspot",
    object: "deals",
    label: "Deal amount (€)",
    type: "currency",
    metricId: "hubspot.deal.sum_amount",
  },
  {
    id: "count",
    source: "hubspot",
    object: "deals",
    label: "Deal count",
    type: "count",
    metricId: "hubspot.deal.count",
  },
  {
    id: "stage",
    source: "hubspot",
    object: "deals",
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
    object: "deals",
    label: "Pipeline",
    type: "string",
  },
  {
    id: "ownerId",
    source: "hubspot",
    object: "deals",
    label: "Deal owner",
    type: "string",
  },

  // HubSpot — contacts
  // Only `count` is aggregatable today (no numeric amount on the
  // contact mirror table), but `lifecycleStage` + `ownerId` need to
  // appear in the filter picker, and the wizard reads SOURCE_FIELDS
  // for both. Anything numeric on contacts (e.g. ARR per contact)
  // surfaces here later once the mirror table has the column.
  {
    id: "count",
    source: "hubspot",
    object: "contacts",
    label: "Contact count",
    type: "count",
    metricId: "hubspot.contact.count",
  },
  {
    id: "lifecycleStage",
    source: "hubspot",
    object: "contacts",
    label: "Lifecycle stage",
    type: "enum",
    enumValues: [
      { value: "subscriber", label: "Subscriber" },
      { value: "lead", label: "Lead" },
      { value: "marketingqualifiedlead", label: "Marketing qualified" },
      { value: "salesqualifiedlead", label: "Sales qualified" },
      { value: "opportunity", label: "Opportunity" },
      { value: "customer", label: "Customer" },
      { value: "evangelist", label: "Evangelist" },
    ],
  },
  {
    id: "ownerId",
    source: "hubspot",
    object: "contacts",
    label: "Contact owner",
    type: "string",
  },
  {
    id: "email",
    source: "hubspot",
    object: "contacts",
    label: "Email",
    type: "string",
  },
];

/**
 * `object` (optional) narrows hubspot fields to either deals or
 * contacts. Stripe always resolves to charges so the `object` filter
 * is a no-op there.
 */
export function fieldsForSource(
  source: Source,
  types?: FieldType[],
  object?: SourceObject,
): SourceField[] {
  let filtered = SOURCE_FIELDS.filter((f) => f.source === source);
  if (object) filtered = filtered.filter((f) => f.object === object);
  if (!types) return filtered;
  return filtered.filter((f) => types.includes(f.type));
}

// ─────────────────────────────────────────────────────────────────────────────
// Date fields per source — Step 5 of the wizard.
// ─────────────────────────────────────────────────────────────────────────────

export type DateFieldOption = {
  id: string;
  source: Source;
  /**
   * Which object this date field belongs to. `closeDate` is deals-only,
   * `createdAt` exists on both deals and contacts — when an entry
   * applies to multiple objects we list it once per object so the
   * filter step gets the right defaults.
   */
  object: SourceObject;
  label: string;
};

export const DATE_FIELDS: DateFieldOption[] = [
  { id: "occurredAt", source: "stripe", object: "charges", label: "Charge occurred at" },
  { id: "closeDate", source: "hubspot", object: "deals", label: "Deal close date" },
  { id: "createdAt", source: "hubspot", object: "deals", label: "Deal created date" },
  { id: "createdAt", source: "hubspot", object: "contacts", label: "Contact created date" },
];

export function dateFieldsForSource(
  source: Source,
  object?: SourceObject,
): DateFieldOption[] {
  let filtered = DATE_FIELDS.filter((d) => d.source === source);
  if (object) filtered = filtered.filter((d) => d.object === object);
  return filtered;
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
 * Map a `SourceObject` to the substring the metric-id loop should
 * require — keeps the dispatch readable.
 *
 *   deals    → "deal"     (matches "hubspot.deal.*")
 *   contacts → "contact"  (matches "hubspot.contact.*")
 *   charges  → "charge"   (matches "stripe.charge.*")
 *
 * Useful because METRICS uses the singular noun (deal, contact,
 * charge) in the id while the wizard's `object` is the plural.
 */
function metricIdSlugForObject(object: SourceObject): string {
  if (object === "deals") return ".deal.";
  if (object === "contacts") return ".contact.";
  return ".charge.";
}

/**
 * Resolve a `(source, aggregation, fieldId)` tuple to a `metric_id`
 * registered in METRICS. Returns null when no compatible metric exists
 * (e.g. user picked Avg of a non-numeric field).
 *
 * `object` (optional) narrows hubspot to deals vs contacts — without
 * it, `count` would always resolve to `hubspot.deal.count` (the first
 * column-less hubspot metric in the catalog) and contact aggregations
 * would be unreachable.
 */
export function findMetricId(
  source: Source,
  agg: Aggregation,
  fieldId: string,
  object?: SourceObject,
): string | null {
  const slug = object ? metricIdSlugForObject(object) : null;
  for (const m of METRICS) {
    if (m.source !== source) continue;
    if (m.aggregation !== agg) continue;
    if (slug && !m.id.includes(slug)) continue;
    // Count metrics: any column-less metric matches.
    if (agg === "count" && !m.column) return m.id;
    if (agg === "count_distinct" && m.column === fieldId) return m.id;
    if (m.column === fieldId) return m.id;
  }
  return null;
}

/**
 * Inverse: pull the object out of a saved metric id so the wizard can
 * hydrate the Object selector on edit. Falls back to "deals" for
 * unknown hubspot ids (the historical default) and "charges" for
 * stripe.
 */
export function objectFromMetricId(
  source: Source,
  metricId: string,
): SourceObject {
  if (source === "stripe") return "charges";
  if (metricId.includes(".contact.")) return "contacts";
  return "deals";
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
  object: SourceObject;
  aggregation: WizardAggregation;
  /** The field-id the wizard renders in Step 3 ("amount" / "count" / etc.). */
  column: string;
}> = METRICS.map((m) => ({
  id: m.id,
  source: m.source,
  object: objectFromMetricId(m.source, m.id),
  aggregation: (m.aggregation === "count_distinct"
    ? "count"
    : (m.aggregation as WizardAggregation)),
  column: m.column ?? "count",
}));
