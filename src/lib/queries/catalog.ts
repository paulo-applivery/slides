/**
 * Client-safe slice of the metrics catalog — strips Drizzle table refs so
 * we don't drag the DB into the client bundle.
 */
import {
  METRICS,
  metricFilters,
  metricGroupByOptions,
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
