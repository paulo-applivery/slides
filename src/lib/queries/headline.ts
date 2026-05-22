/**
 * Hero-number computation per widget type.
 *
 * Charts on their own (bar, funnel, ranking) don't carry a single top-line
 * number. We compute one from the executor result (when bound) or from the
 * SEED fallback (when unbound) so every widget renders with a hero value
 * that reads from across a room.
 *
 *   bar      → SUM of every bucket
 *   funnel   → first stage's value (top of funnel)
 *   ranking  → #1's value (top performer)
 *   gauge    → unused — gauge renders its value inside the arc
 *   single   → unused — the value IS the hero
 */
import type { ExecutorResult } from "./executor";
import type { WidgetType } from "./compat";
import { SEED } from "@/lib/seed";

export type Headline = {
  value: string;
  /** Tiny caption shown under the headline. */
  caption: string;
};

const fmtCompact = (n: number): string => {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return (v < 10 ? v.toFixed(1) : Math.round(v).toString()) + "M";
  }
  if (abs >= 1_000) return Math.round(n / 1_000) + "k";
  return Math.round(n).toString();
};

const formatByUnit = (
  raw: number,
  unit: ExecutorResult["formatter"],
): string => {
  if (unit === "EUR-cents") return "€" + fmtCompact(raw / 100);
  if (unit === "EUR") return "€" + fmtCompact(raw);
  if (unit === "percent") return raw.toFixed(1) + "%";
  return fmtCompact(raw);
};

export function headlineFromResult(
  widgetType: WidgetType,
  result: ExecutorResult,
): Headline | null {
  if (widgetType === "bar" && result.kind === "timeseries") {
    const total = result.points.reduce((a, p) => a + p.value, 0);
    return { value: formatByUnit(total, result.formatter), caption: "total this period" };
  }
  if (widgetType === "ranking" && result.kind === "groupby") {
    const top = result.rows[0]?.value ?? 0;
    return {
      value: formatByUnit(top, result.formatter),
      caption: result.rows[0]?.label ? `top — ${result.rows[0].label}` : "top performer",
    };
  }
  // funnel kind not in executor yet — falls through to SEED below.
  return null;
}

export function headlineFromSeed(widgetType: WidgetType): Headline | null {
  switch (widgetType) {
    case "bar": {
      const total = SEED.bars.reduce((a, b) => a + b.value, 0);
      return { value: "€" + fmtCompact(total), caption: "total this period" };
    }
    case "funnel":
      return {
        value: SEED.funnel[0].formatted ?? String(SEED.funnel[0].value),
        caption: SEED.funnel[0].label.toLowerCase(),
      };
    case "ranking": {
      const top = SEED.reps.reduce((a, r) => Math.max(a, r.value), 0);
      const leader = [...SEED.reps].sort((a, b) => b.value - a.value)[0];
      return {
        value: "€" + fmtCompact(top),
        caption: leader ? `top — ${leader.name}` : "top performer",
      };
    }
    default:
      return null;
  }
}
