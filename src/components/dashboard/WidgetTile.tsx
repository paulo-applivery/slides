import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { queries as queriesTable } from "@/lib/db/schema";
import { runQuery, type ExecutorResult } from "@/lib/queries/executor";
import { resolveTimePeriod } from "@/lib/timePeriod";
import {
  adaptBar,
  adaptGauge,
  adaptRanking,
  adaptSingleValue,
  WIDGET_ACCEPTS,
  type WidgetType,
} from "@/lib/queries/compat";
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
import type { WidgetChip } from "./widgetChip";
import type { TimePeriod } from "@/lib/timePeriod";
import type { DashboardLayout } from "@/lib/db/schema";

type Widget = DashboardLayout["widgets"][number];

/**
 * Layout-owned display metadata.
 *
 * `title` + `titleSize` + `chip` are the labelling surfaced in the new
 * minimal chrome. The remaining `seedKey` / `unit` / `period` / `target`
 * fields affect the *content* the chart renders, not the chrome around
 * it.
 */
type WidgetDisplay = {
  title?: string;
  /** Title font-size in px. When unset, scales fluidly with cell height. */
  titleSize?: number;
  /** Horizontal alignment of the title within the head. */
  titleAlign?: "left" | "center" | "right";
  /** Optional inline chip beside the title. */
  chip?: WidgetChip;
  /** Widget-level time period override (otherwise dashboard's range wins). */
  timePeriod?: TimePeriod;
  /** Picks which SEED entry to fall back to when the widget is unbound. */
  seedKey?: "mrr" | "arr" | "churn" | "newCust";
  unit?: "€" | "%" | "#";
  period?: string;
  /** Gauge-specific: hardcoded target until queries can carry one. */
  target?: number;
};

/**
 * Server-rendered widget tile — title + chart, period.
 *
 * Bound widgets fetch and run their saved query; unbound widgets fall
 * back to SEED. All operator actions (bind/unbind/remove) live in the
 * 3-dot overflow menu — never in the widget chrome itself.
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
        // When the widget has its own time period, resolve it now and
        // pass concrete dates as an override — beats the query's
        // `dateRange`. Without this, the picker UI looked like it
        // worked but the executor kept honouring the saved query's
        // window, producing "different data" between the two paths.
        display.timePeriod
          ? { dateOverride: toDateWindow(display.timePeriod) }
          : undefined,
      );
    } catch (err) {
      executorError = err instanceof Error ? err.message : String(err);
    }
  }

  const compat =
    !bound ||
    (executorResult && WIDGET_ACCEPTS[widget.type].includes(executorResult.kind));

  const resolvedTitle = resolveTitle(display, widget.type, bound?.name);
  return (
    <WidgetShell
      title={resolvedTitle}
      titleSize={display.titleSize}
      titleAlign={display.titleAlign}
      chip={display.chip}
      dragHandle={editable}
      action={
        editable ? (
          <WidgetOverflowMenu
            dashboardId={dashboardId}
            widgetId={widget.id}
            widgetType={widget.type}
            widgetName={bound?.name ?? resolvedTitle}
            hasBinding={!!bound}
            currentTitle={display.title ?? resolvedTitle}
            currentTitleSize={display.titleSize}
            currentTitleAlign={display.titleAlign}
            currentChip={display.chip}
            currentTimePeriod={display.timePeriod}
            currentTarget={display.target}
          />
        ) : undefined
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

/**
 * Convert a widget `TimePeriod` into the {from, to} window the executor
 * understands. `null` end of an "all time" period leaves both sides
 * open — the executor skips the date filter entirely.
 *
 * The resolver returns ISO `yyyy-MM-dd` strings; we shift end-of-day so
 * the filter is inclusive of the last day (HubSpot deal close dates are
 * timestamps).
 */
function toDateWindow(tp: TimePeriod): {
  from: Date | null;
  to: Date | null;
} {
  const r = resolveTimePeriod(tp);
  return {
    from: r.start ? new Date(`${r.start}T00:00:00.000Z`) : null,
    to: r.end ? new Date(`${r.end}T23:59:59.999Z`) : null,
  };
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
