import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { queries as queriesTable } from "@/lib/db/schema";
import { runQuery, type ExecutorResult } from "@/lib/queries/executor";
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
import {
  BarChart,
  FunnelChart,
  GaugeChart,
  RankingWidget,
  SingleValue,
  WidgetShell,
} from "@/components/widgets";
import { SEED, type Kpi } from "@/lib/seed";
import { Icons } from "@/components/ui/Icon";
import { WidgetOverflowMenu } from "./WidgetOverflowMenu";
import type { DashboardLayout } from "@/lib/db/schema";

type Widget = DashboardLayout["widgets"][number];

/**
 * Optional display metadata stored on each layout widget.
 *
 * The layout owns user-facing labels (title, subtitle, unit, period…) so a
 * single SingleValue widget can be "MRR" or "Churn" depending on which
 * row it represents — bound or not. Saved-query bindings supply numbers,
 * never names.
 */
type WidgetDisplay = {
  title?: string;
  /** Title font-size in px. Defaults to the design system's 13 px. */
  titleSize?: number;
  subtitle?: string;
  /** Picks which SEED entry to fall back to when the widget is unbound. */
  seedKey?: "mrr" | "arr" | "churn" | "newCust";
  unit?: "€" | "%" | "#";
  period?: string;
  /** Gauge-specific: hardcoded target until queries can carry one. */
  target?: number;
  /** Override the auto-computed hero number caption. */
  headlineCaption?: string;
};

/**
 * Server-rendered widget tile.
 *
 * If `widget.queryId` is set, fetches the saved query, runs it, adapts the
 * result to widget props, and renders the appropriate component.
 *
 * If `widget.queryId` is null, the widget renders its SEED fallback (picked
 * by `display.seedKey` so the four KPI tiles differentiate) with a Demo
 * badge + "Bind a query" CTA in the overflow menu.
 */
export async function WidgetTile({
  dashboardId,
  workspaceId,
  widget,
  editable,
}: {
  dashboardId: string;
  workspaceId: string;
  widget: Widget;
  editable: boolean;
}) {
  // Placement (grid-row / grid-column) is owned by the parent `<Dashboard>`
  // so this component just renders the shell + content.
  const display = (widget.display ?? {}) as WidgetDisplay;

  const bound = widget.queryId
    ? await db.query.queries.findFirst({
        where: and(
          eq(queriesTable.id, widget.queryId),
          eq(queriesTable.workspaceId, workspaceId),
        ),
      })
    : null;

  let executorResult: ExecutorResult | null = null;
  let executorError: string | null = null;

  if (bound) {
    try {
      executorResult = await runQuery(
        workspaceId,
        bound.config as Parameters<typeof runQuery>[1],
      );
    } catch (err) {
      executorError = err instanceof Error ? err.message : String(err);
    }
  }

  const compat =
    !bound ||
    (executorResult && WIDGET_ACCEPTS[widget.type].includes(executorResult.kind));

  // Hero number above the chart. Bar/Funnel/Ranking get one; Gauge +
  // SingleValue render their hero value inside the chart and skip this.
  let headline: Headline | null = null;
  if (widget.type === "bar" || widget.type === "funnel" || widget.type === "ranking") {
    if (executorResult && compat) {
      headline = headlineFromResult(widget.type, executorResult);
    }
    if (!headline) headline = headlineFromSeed(widget.type);
  }
  if (headline && display.headlineCaption) {
    headline = { ...headline, caption: display.headlineCaption };
  }

  return (
    <WidgetShell
      title={resolveTitle(display, widget.type, bound?.name)}
      titleSize={display.titleSize}
      subtitle={resolveSubtitle(display, widget.type, bound?.name)}
      headline={headline?.value}
      headlineCaption={headline?.caption}
      source={bound ? (bound.source === "stripe" ? "stripe" : "hubspot") : undefined}
      updated={bound ? "now" : undefined}
      dragHandle={editable}
      action={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {!bound && (
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
          )}
          {editable && (
            <WidgetOverflowMenu
              dashboardId={dashboardId}
              widgetId={widget.id}
              widgetType={widget.type}
              widgetName={bound?.name ?? resolveTitle(display, widget.type, undefined)}
              hasBinding={!!bound}
            />
          )}
        </span>
      }
    >
      {executorError ? (
        <WidgetError message={executorError} />
      ) : executorResult && !compat ? (
        <WidgetError
          message={`This widget expects ${WIDGET_ACCEPTS[widget.type].join(" or ")} queries, but the binding returned ${executorResult.kind}.`}
        />
      ) : executorResult ? (
        renderBound(widget, display, executorResult)
      ) : (
        renderSeedFallback(widget, display)
      )}
    </WidgetShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Title / subtitle resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Title priority:
 *   1. `display.title` — layout-owned label (e.g. "MRR")
 *   2. `query.name`    — if bound, fall back to the saved query's name
 *   3. humanType(t)    — last resort ("Single value")
 */
function resolveTitle(
  display: WidgetDisplay,
  type: WidgetType,
  queryName: string | undefined,
): string {
  return display.title ?? queryName ?? humanType(type);
}

/**
 * Subtitle priority:
 *   1. `display.subtitle` — always wins if set
 *   2. bound → "Live · <query name>" (when display.title overrode the
 *      query name, we still show it here so the user sees the source)
 *   3. unbound → "<human type> · demo data"
 */
function resolveSubtitle(
  display: WidgetDisplay,
  type: WidgetType,
  queryName: string | undefined,
): string {
  if (display.subtitle) return display.subtitle;
  if (queryName) return `Live · ${queryName}`;
  return `${humanType(type)} · demo data`;
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

// ─────────────────────────────────────────────────────────────────────────────
// Bound rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderBound(
  widget: Widget,
  display: WidgetDisplay,
  res: ExecutorResult,
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
            unit={display.unit ?? p.unit}
            delta={p.delta}
            deltaPct={p.deltaPct}
            spark={p.spark}
            period={display.period ?? "this period"}
          />
        );
      }
    case "gauge":
      if (res.kind !== "single") return null;
      {
        const p = adaptGauge(res, display);
        return <GaugeChart value={p.value} target={p.target} />;
      }
    case "bar":
      if (res.kind !== "timeseries") return null;
      return <BarChart data={adaptBar(res)} />;
    case "ranking":
      if (res.kind !== "groupby") return null;
      return <RankingWidget reps={adaptRanking(res)} />;
    case "funnel":
      // No funnel kind in the executor yet — fall through to SEED.
      return renderSeedFallback(widget, display);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED fallback rendering
// ─────────────────────────────────────────────────────────────────────────────

const SEED_KPI: Record<NonNullable<WidgetDisplay["seedKey"]>, Kpi> = {
  mrr: SEED.mrr,
  arr: SEED.arr,
  churn: SEED.churn,
  newCust: SEED.newCust,
};

function renderSeedFallback(widget: Widget, display: WidgetDisplay) {
  switch (widget.type) {
    case "singleValue": {
      const kpi = display.seedKey ? SEED_KPI[display.seedKey] : SEED.mrr;
      return (
        <SingleValue
          value={kpi.value}
          label={widget.id}
          unit={display.unit ?? "€"}
          delta={kpi.delta}
          deltaPct={kpi.deltaPct}
          spark={kpi.spark}
          period={display.period ?? "vs last month"}
        />
      );
    }
    case "gauge":
      return (
        <GaugeChart
          value={SEED.gauge.value}
          target={display.target ?? SEED.gauge.target}
        />
      );
    case "bar":
      return <BarChart data={[...SEED.bars]} />;
    case "funnel":
      return <FunnelChart stages={[...SEED.funnel]} />;
    case "ranking":
      return <RankingWidget reps={[...SEED.reps]} />;
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
