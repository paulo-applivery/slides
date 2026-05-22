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
import {
  adaptBar,
  adaptGauge,
  adaptRanking,
  adaptSingleValue,
  WIDGET_ACCEPTS,
  type WidgetType,
} from "@/lib/queries/compat";
import {
  headlineFromResult,
  headlineFromSeed,
  type Headline,
} from "@/lib/queries/headline";
import type { DashboardLayout } from "@/lib/db/schema";
import type { TvWidgetResult } from "@/app/api/tv/data/route";

type WidgetDisplay = {
  title?: string;
  titleSize?: number;
  subtitle?: string;
  headlineCaption?: string;
};

/**
 * TV-scale layout-driven dashboard slide.
 *
 * Iterates `dashboard.layout.widgets` and renders each widget using its
 * pre-fetched executor result (live data from `/api/tv/data`). Unbound or
 * errored widgets fall back to SEED with a Demo pill so the slide always
 * looks complete.
 *
 * Same `.dash-grid` + `.col-N` chrome as the in-app dashboard; CSS overrides
 * in app.css bump widget heights at TV breakpoints so the numbers read from
 * across a room.
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

  // The TV slide has a finite height. We use explicit row + column
  // placement so the dashboard always fits the screen, no matter how many
  // widgets the layout contains. `grid-template-rows: repeat(N, 1fr)`
  // means each row gets an equal fraction of available height — so
  // adding more widgets shrinks every row proportionally; nothing falls
  // off the bottom of the TV.
  const totalRows = Math.max(
    1,
    ...widgets.map((w) => w.pos.y + w.pos.h),
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        height: "100%",
        minHeight: 0,
      }}
    >
      <div className="tv-eyebrow">
        <span className="t-micro">{dashboard.name}</span>
        <span className="badge badge-brand">
          <span className="dot" />
          Live
        </span>
      </div>
      <div
        className="dash-grid"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
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

  // Hero number above Bar/Funnel/Ranking. Gauge + SingleValue carry it
  // inside the chart already.
  let headline: Headline | null = null;
  if (widget.type === "bar" || widget.type === "funnel" || widget.type === "ranking") {
    if (result?.kind === "ok") {
      headline = headlineFromResult(widget.type, result.result);
    }
    if (!headline) headline = headlineFromSeed(widget.type);
    if (headline && display.headlineCaption) {
      headline = { ...headline, caption: display.headlineCaption };
    }
  }

  return (
    <WidgetShell
      title={title}
      titleSize={display.titleSize}
      subtitle={
        display.subtitle ?? (status === "live" ? "Live · query bound" : `${humanType(widget.type)} · demo`)
      }
      headline={headline?.value}
      headlineCaption={headline?.caption}
      dragHandle={false}
      action={
        status === "demo" ? (
          <span
            className="badge"
            title="Demo data — bind this widget to a saved query"
            style={{
              background: "var(--bg-elev-2)",
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
            }}
          >
            Demo
          </span>
        ) : status === "error" ? (
          <span className="badge badge-danger">
            <span className="dot" />
            Error
          </span>
        ) : (
          <span className="badge badge-success">
            <span className="dot" />
            Live
          </span>
        )
      }
    >
      {renderInside(widget, result, status)}
    </WidgetShell>
  );
}

type Status = "live" | "demo" | "error" | "incompatible";

function resultStatus(widgetType: WidgetType, result: TvWidgetResult | undefined): Status {
  if (!result || result.kind === "unbound") return "demo";
  if (result.kind === "error") return "error";
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
  if (status === "live" && result?.kind === "ok") {
    return renderBound(widget, result.result);
  }
  return renderSeedFallback(widget);
}

function renderBound(
  widget: DashboardLayout["widgets"][number],
  res: import("@/lib/queries/executor").ExecutorResult,
) {
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
          />
        );
      }
    case "gauge":
      if (res.kind !== "single") return null;
      {
        const p = adaptGauge(res, widget.display as { target?: number } | undefined);
        return <GaugeChart value={p.value} target={p.target} />;
      }
    case "bar":
      if (res.kind !== "timeseries") return null;
      return <BarChart data={adaptBar(res)} />;
    case "ranking":
      if (res.kind !== "groupby") return null;
      return <RankingWidget reps={adaptRanking(res)} />;
    case "funnel":
      // Funnel kind not in executor yet — show SEED until slice 6.
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
