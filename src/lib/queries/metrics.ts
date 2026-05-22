/**
 * Metric catalog — the menu of choices in the query builder.
 *
 * Each metric is a (source, identifier, aggregation, formatter) tuple
 * keyed to a specific mirror table. The executor resolves the metric to
 * a Drizzle expression at compile time.
 *
 * Adding a new metric here is the canonical way to expand what users can
 * query. Filters available depend on the metric — see `metricFilters()`.
 */
import type { Source } from "./ast";
import {
  hubspotContacts,
  hubspotDeals,
  stripeCharges,
} from "@/lib/db/schema";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

export type Aggregation = "sum" | "count" | "avg" | "count_distinct";

export type MetricDef = {
  id: string;
  source: Source;
  label: string;
  description: string;
  /** Underlying Drizzle table. */
  table: SQLiteTable;
  /** Column used by the aggregation (null for COUNT(*)). */
  column: string | null;
  aggregation: Aggregation;
  /** Stored unit, used to format the result. */
  unit: "EUR-cents" | "EUR" | "count" | "percent";
  /** Field used for date filters (occurredAt, createdAt, etc.). */
  dateField: string;
};

export type FilterOption = {
  field: string;
  label: string;
  op: "eq" | "in";
  /** Discrete values shown in the builder UI; if omitted, falls back to free text. */
  options?: Array<{ value: string; label: string }>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────────────────────────

export const METRICS: MetricDef[] = [
  // Stripe — charges
  {
    id: "stripe.charge.sum_amount",
    source: "stripe",
    label: "Charge volume (€)",
    description: "Sum of all charges (use a status filter for paid-only).",
    table: stripeCharges,
    column: "amount",
    aggregation: "sum",
    unit: "EUR-cents",
    dateField: "occurredAt",
  },
  {
    id: "stripe.charge.count",
    source: "stripe",
    label: "Charge count",
    description: "Number of charges in the range.",
    table: stripeCharges,
    column: null,
    aggregation: "count",
    unit: "count",
    dateField: "occurredAt",
  },
  {
    id: "stripe.charge.distinct_customers",
    source: "stripe",
    label: "Distinct paying customers",
    description: "Unique customer_ids that paid in the range.",
    table: stripeCharges,
    column: "customerId",
    aggregation: "count_distinct",
    unit: "count",
    dateField: "occurredAt",
  },
  // HubSpot — deals
  {
    id: "hubspot.deal.sum_amount",
    source: "hubspot",
    label: "Deal value (€)",
    description: "Sum of deal amounts in the range.",
    table: hubspotDeals,
    column: "amount",
    aggregation: "sum",
    unit: "EUR",
    dateField: "closeDate",
  },
  {
    id: "hubspot.deal.count",
    source: "hubspot",
    label: "Deal count",
    description: "Number of deals in the range.",
    table: hubspotDeals,
    column: null,
    aggregation: "count",
    unit: "count",
    dateField: "closeDate",
  },
  // HubSpot — contacts
  {
    id: "hubspot.contact.count",
    source: "hubspot",
    label: "Contact count",
    description: "Number of contacts created in the range.",
    table: hubspotContacts,
    column: null,
    aggregation: "count",
    unit: "count",
    dateField: "createdAt",
  },
];

export const METRICS_BY_ID = new Map(METRICS.map((m) => [m.id, m] as const));

export function metricsForSource(source: Source): MetricDef[] {
  return METRICS.filter((m) => m.source === source);
}

// ─────────────────────────────────────────────────────────────────────────────
// Available filters per metric
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the filter chips the builder UI should offer for a given metric. */
export function metricFilters(metricId: string): FilterOption[] {
  switch (metricId) {
    case "stripe.charge.sum_amount":
    case "stripe.charge.count":
    case "stripe.charge.distinct_customers":
      return [
        {
          field: "paid",
          label: "Paid",
          op: "eq",
          options: [
            { value: "true", label: "Paid only" },
            { value: "false", label: "Failed only" },
          ],
        },
        {
          field: "status",
          label: "Status",
          op: "eq",
          options: [
            { value: "succeeded", label: "Succeeded" },
            { value: "pending", label: "Pending" },
            { value: "failed", label: "Failed" },
          ],
        },
      ];

    case "hubspot.deal.sum_amount":
    case "hubspot.deal.count":
      return [
        {
          field: "stage",
          label: "Deal stage",
          op: "eq",
          options: [
            { value: "appointmentscheduled", label: "Appointment scheduled" },
            { value: "qualifiedtobuy", label: "Qualified to buy" },
            { value: "presentationscheduled", label: "Presentation scheduled" },
            { value: "decisionmakerboughtin", label: "Decision-maker bought in" },
            { value: "contractsent", label: "Contract sent" },
            { value: "closedwon", label: "Closed won" },
            { value: "closedlost", label: "Closed lost" },
          ],
        },
      ];

    case "hubspot.contact.count":
      return [
        {
          field: "lifecycleStage",
          label: "Lifecycle stage",
          op: "eq",
          options: [
            { value: "subscriber", label: "Subscriber" },
            { value: "lead", label: "Lead" },
            { value: "marketingqualifiedlead", label: "Marketing qualified" },
            { value: "salesqualifiedlead", label: "Sales qualified" },
            { value: "opportunity", label: "Opportunity" },
            { value: "customer", label: "Customer" },
            { value: "evangelist", label: "Evangelist" },
          ],
        },
      ];

    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Group-by options per metric
// ─────────────────────────────────────────────────────────────────────────────

export type GroupByOption = {
  /** Column on the metric's underlying table. */
  field: string;
  label: string;
  /**
   * Optional mapping for human-readable labels in the result. When set, the
   * executor joins the grouped rows with this table to resolve names.
   */
  labelFrom?: {
    table: "hubspot_owners";
    keyField: "hsId";
    labelExpression: "first_last_or_email";
  };
};

export function metricGroupByOptions(metricId: string): GroupByOption[] {
  switch (metricId) {
    case "stripe.charge.sum_amount":
    case "stripe.charge.count":
      return [
        { field: "customerId", label: "Customer" },
        { field: "currency", label: "Currency" },
        { field: "status", label: "Status" },
      ];
    case "stripe.charge.distinct_customers":
      return [
        { field: "currency", label: "Currency" },
      ];
    case "hubspot.deal.sum_amount":
    case "hubspot.deal.count":
      return [
        {
          field: "ownerId",
          label: "Owner",
          labelFrom: {
            table: "hubspot_owners",
            keyField: "hsId",
            labelExpression: "first_last_or_email",
          },
        },
        { field: "stage", label: "Deal stage" },
        { field: "pipeline", label: "Pipeline" },
      ];
    case "hubspot.contact.count":
      return [
        { field: "lifecycleStage", label: "Lifecycle stage" },
        {
          field: "ownerId",
          label: "Owner",
          labelFrom: {
            table: "hubspot_owners",
            keyField: "hsId",
            labelExpression: "first_last_or_email",
          },
        },
      ];
    default:
      return [];
  }
}
