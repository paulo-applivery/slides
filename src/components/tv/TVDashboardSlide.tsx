"use client";

import {
  BarChart,
  FunnelChart,
  GaugeChart,
  RankingWidget,
  SingleValue,
  WidgetShell,
} from "@/components/widgets";
import { SEED } from "@/lib/seed";
import { Icons } from "@/components/ui/Icon";
import { pickConditionalColor } from "@/lib/format";
import {
  adaptBar,
  adaptGauge,
  adaptRanking,
  adaptSingleValue,
  WIDGET_ACCEPTS,
  type WidgetType,
} from "@/lib/queries/compat";
import type { DashboardLayout } from "@/lib/db/schema";
import type { TvWidgetResult } from "@/app/api/tv/data/route";

import type { WidgetChip } from "@/components/dashboard/widgetChip";

type WidgetDisplay = {
  title?: string;
  titleSize?: number;
  titleAlign?: "left" | "center" | "right";
  chip?: WidgetChip;
};

/**
 * Layout-driven TV slide. Renders every widget in the dashboard layout
 * as **title + chart only**, fitted to the screen via the same explicit
 * grid placement as the in-app editor. No badges, no headline numbers,
 * no footers — broadcast clean.
 */
export function TVDashboardSlide({
  dashboard,
}: {
  dashboard: {
    id: string;
    name: string;
    layout: DashboardLayout | null;
    widgetResults: Record<string, TvWidgetResult>;
  };
}) {
  const widgets = dashboard.layout?.widgets ?? [];
  if (widgets.length === 0) {
    return (
      <div
        className="tv-layout-gauge"
        style={{ display: "grid", placeItems: "center" }}
      >
        <p
          className="t-body"
          style={{ color: "var(--text-tertiary)", textAlign: "center" }}
        >
          This dashboard has no widgets yet.
        </p>
      </div>
    );
  }

  // Fit-to-screen: equal-fraction rows (`repeat(N, minmax(0, 1fr))`) so
  // adding more widgets shrinks every row proportionally and nothing
  // falls off the bottom of the TV.
  const totalRows = Math.max(
    1,
    ...widgets.map((w) => w.pos.y + w.pos.h),
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        className="dash-grid"
        style={{
          flex: 1,
          minHeight: 0,
          // No `overflow: hidden` here — the individual `.widget`
          // already clips its own content (see app.css), and adding
          // an extra clip on the grid container was chopping every
          // widget's drop-shadow at the edge of the grid, leaving
          // shadows looking sliced/bugged. Letting the grid show
          // overflow restores the elevation on widgets near the
          // bottom and right edges.
          gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`,
        }}
      >
        {widgets.map((w) => (
          <div
            key={w.id}
            style={{
              gridColumn: `${clampCol(w.pos.x + 1)} / span ${clampSpan(w.pos.w)}`,
              gridRow: `${w.pos.y + 1} / span ${Math.max(1, w.pos.h)}`,
              minHeight: 0,
              minWidth: 0,
            }}
          >
            <TvWidget
              widget={w}
              result={dashboard.widgetResults[w.id]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Clamp into the 12-col grid so a malformed layout can't overflow. */
function clampCol(start: number) {
  return Math.max(1, Math.min(12, start));
}
function clampSpan(w: number) {
  return Math.max(1, Math.min(12, w));
}

function TvWidget({
  widget,
  result,
}: {
  widget: DashboardLayout["widgets"][number];
  result?: TvWidgetResult;
}) {
  const status = resultStatus(widget.type, result);
  const display = (widget.display ?? {}) as WidgetDisplay;
  const title = display.title ?? humanType(widget.type);

  return (
    <WidgetShell
      title={title}
      titleSize={display.titleSize}
      titleAlign={display.titleAlign}
      chip={display.chip}
      dragHandle={false}
    >
      {renderInside(widget, result, status)}
    </WidgetShell>
  );
}

type Status = "live" | "demo" | "error" | "incompatible";

function resultStatus(widgetType: WidgetType, result: TvWidgetResult | undefined): Status {
  if (!result || result.kind === "unbound") return "demo";
  if (result.kind === "error") return "error";
  // Funnel-ok is always live — the pre-fetcher already mapped each
  // stage to a value (or 0 for unbound stages). No executor-kind check
  // because the executor has no funnel kind.
  if (result.kind === "funnel-ok") return "live";
  if (!WIDGET_ACCEPTS[widgetType].includes(result.result.kind)) {
    return "incompatible";
  }
  return "live";
}

function renderInside(
  widget: DashboardLayout["widgets"][number],
  result: TvWidgetResult | undefined,
  status: Status,
) {
  if (status === "error") {
    return (
      <WidgetError
        message={
          result?.kind === "error" ? result.error : "Query failed."
        }
      />
    );
  }
  if (status === "incompatible") {
    return (
      <WidgetError
        message={`This widget expects ${WIDGET_ACCEPTS[widget.type].join(" or ")} queries.`}
      />
    );
  }
  if (status === "live" && result?.kind === "funnel-ok") {
    // Pre-resolved stages from the TV pre-fetcher — render directly.
    return <FunnelChart stages={result.stages} />;
  }
  if (status === "live" && result?.kind === "ok") {
    return renderBound(widget, result.result, result.conditionalColors);
  }
  return renderSeedFallback(widget);
}

function renderBound(
  widget: DashboardLayout["widgets"][number],
  res: import("@/lib/queries/executor").ExecutorResult,
  conditionalColors?: {
    colors: [string, string, string];
    thresholds: [number, number];
  },
) {
  const display = widget.display as { target?: number } | undefined;
  // Same color-pick logic the editor uses — falls back to null when
  // there's no target or no spec.
  const condColor =
    res.kind === "single"
      ? pickConditionalColor(res.value ?? 0, display?.target, conditionalColors)
      : null;
  switch (widget.type) {
    case "singleValue":
      if (res.kind !== "single") return null;
      {
        const p = adaptSingleValue(res);
        return (
          <SingleValue
            value={p.value}
            label={widget.id}
            unit={p.unit}
            delta={p.delta}
            deltaPct={p.deltaPct}
            spark={p.spark}
            period="live"
            formatted={p.formatted}
            valueColor={condColor}
          />
        );
      }
    case "gauge":
      if (res.kind !== "single") return null;
      {
        const p = adaptGauge(res, widget.display as { target?: number } | undefined);
        return <GaugeChart value={p.value} target={p.target} color={condColor} />;
      }
    case "bar":
      if (res.kind !== "timeseries") return null;
      return <BarChart data={adaptBar(res)} />;
    case "ranking":
      if (res.kind !== "groupby") return null;
      // Ranking colors per-row against the dataset max — pass the
      // full conditionalColors spec rather than the pre-resolved hex.
      return (
        <RankingWidget reps={adaptRanking(res, conditionalColors)} />
      );
    case "funnel":
      return renderSeedFallback(widget);
  }
}

function renderSeedFallback(widget: DashboardLayout["widgets"][number]) {
  switch (widget.type) {
    case "singleValue":
      return (
        <SingleValue
          value={SEED.mrr.value}
          label={widget.id}
          unit="€"
          delta={SEED.mrr.delta}
          deltaPct={SEED.mrr.deltaPct}
          spark={SEED.mrr.spark}
          period="vs last month"
        />
      );
    case "gauge":
      return <GaugeChart value={SEED.gauge.value} target={SEED.gauge.target} />;
    case "bar":
      return <BarChart data={[...SEED.bars]} />;
    case "funnel":
      return <FunnelChart stages={[...SEED.funnel]} />;
    case "ranking":
      return <RankingWidget reps={[...SEED.reps]} />;
  }
}

function humanType(t: WidgetType): string {
  switch (t) {
    case "singleValue":
      return "Single value";
    case "gauge":
      return "Gauge";
    case "bar":
      return "Bar chart";
    case "funnel":
      return "Funnel";
    case "ranking":
      return "Ranking";
  }
}

function WidgetError({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "var(--danger)",
        background: "var(--danger-soft)",
        borderRadius: 10,
        margin: 8,
      }}
    >
      <Icons.Close size={20} />
      <span
        className="t-small"
        style={{ color: "var(--danger)", textAlign: "center" }}
      >
        {message}
      </span>
    </div>
  );
}
