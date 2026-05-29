/**
 * Widget ↔ query-kind compatibility map + adapters.
 *
 * Used by:
 *  - the query picker on the dashboard, to filter saved queries to ones a
 *    given widget can render
 *  - the dashboard renderer, to translate executor results into widget props
 */
import type { QueryKind } from "./ast";
import type { ExecutorResult } from "./executor";
import { pickConditionalColor } from "@/lib/format";
import type {
  BarDatum,
  FunnelStage,
  Rep,
} from "@/components/widgets/types";

export type WidgetType =
  | "singleValue"
  | "gauge"
  | "bar"
  | "funnel"
  | "ranking"
  | "text"
  | "image";

/**
 * Which executor kinds a widget can consume. Text and Image are *static*
 * widgets — their content lives in the display blob, not a saved query —
 * so they accept nothing and never run the executor.
 */
export const WIDGET_ACCEPTS: Record<WidgetType, QueryKind[]> = {
  singleValue: ["single"],
  gauge: ["single"],
  bar: ["timeseries"],
  funnel: [],
  ranking: ["groupby"],
  text: [],
  image: [],
};

export function isCompatible(widget: WidgetType, kind: QueryKind): boolean {
  return WIDGET_ACCEPTS[widget].includes(kind);
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapters — executor result → widget props
// ─────────────────────────────────────────────────────────────────────────────

/** EUR-cents need /100 to display in euros; everything else passes through. */
function scaleForUnit(v: number, unit: ExecutorResult["formatter"]): number {
  return unit === "EUR-cents" ? v / 100 : v;
}

export type SingleValueProps = {
  value: number;
  delta: number;
  deltaPct: number;
  spark: number[];
  unit: "€" | "%" | "#";
  /** Pre-formatted display string (outputFormat-aware). */
  formatted?: string;
};

/**
 * Map a single-result to the SingleValue widget. We don't have a delta or
 * sparkline without a previous-period pass yet — set them to neutral so the
 * widget still renders.
 */
export function adaptSingleValue(res: Extract<ExecutorResult, { kind: "single" }>): SingleValueProps {
  const value = scaleForUnit(res.value ?? 0, res.formatter);
  const unit: "€" | "%" | "#" =
    res.formatter === "EUR" || res.formatter === "EUR-cents"
      ? "€"
      : res.formatter === "percent"
        ? "%"
        : "#";
  return {
    value,
    delta: 0,
    deltaPct: 0,
    spark: [value, value],
    unit,
    // `formatted` carries the executor's outputFormat-aware string —
    // SingleValue prefers it over the unit-based fallback. `null` from
    // the executor (rare: edge cases) collapses to undefined so the
    // widget falls back to its internal formatting.
    formatted: res.formatted ?? undefined,
  };
}

export type GaugeProps = {
  value: number;
  target: number;
};

/** Gauge target lives on the widget's display config; default 100_000. */
export function adaptGauge(
  res: Extract<ExecutorResult, { kind: "single" }>,
  display: { target?: number } | undefined,
): GaugeProps {
  return {
    value: scaleForUnit(res.value ?? 0, res.formatter),
    target: display?.target ?? 100_000,
  };
}

export function adaptBar(
  res: Extract<ExecutorResult, { kind: "timeseries" }>,
): BarDatum[] {
  return res.points.map((p) => ({
    label: p.label,
    value: scaleForUnit(p.value, res.formatter),
    prev: p.prev != null ? scaleForUnit(p.prev, res.formatter) : undefined,
    formatted: p.formatted,
  }));
}

/**
 * Build the Rep[] for the Ranking widget.
 *
 * `conditionalColors` (when provided) replaces the default palette with
 * per-row colors picked via `pickConditionalColor(value, max, spec)` —
 * the max value is the natural "target" for a ranking, so the wizard's
 * percentage thresholds become "% of the top performer's value".
 */
export function adaptRanking(
  res: Extract<ExecutorResult, { kind: "groupby" }>,
  conditionalColors?: {
    colors: readonly [string, string, string];
    thresholds: readonly [number, number];
  } | null,
): Rep[] {
  const max = Math.max(...res.rows.map((r) => r.value), 0);
  const palette = ["#5C8BFF", "#FBBF24", "#4ADE80", "#F87171", "#A855F7", "#2DD4BF", "#FB7185"];
  return res.rows.map((r, i) => {
    const name = r.label ?? r.key ?? "—";
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
    const value = scaleForUnit(r.value, res.formatter);
    const condColor = conditionalColors
      ? pickConditionalColor(r.value, max > 0 ? max : null, conditionalColors)
      : null;
    return {
      id: r.key + i,
      name,
      initials,
      color: condColor ?? palette[i % palette.length],
      value,
      target: max > 0 ? max : 1,
      delta: 0,
      formatted: r.formatted,
    };
  });
}

/** Funnel isn't query-bound in slice 1; SEED is the only source. */
export function adaptFunnel(): FunnelStage[] | null {
  return null;
}
