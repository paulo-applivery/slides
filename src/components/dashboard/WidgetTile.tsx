import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { queries as queriesTable } from "@/lib/db/schema";
import { runQuery, type ExecutorResult } from "@/lib/queries/executor";
import { resolveTimePeriod } from "@/lib/timePeriod";
import { pickConditionalColor } from "@/lib/format";
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
  /**
   * Funnel-only: one entry per visible stage, each backed by an
   * optional saved `single` query. Stages with no `queryId` (or whose
   * query no longer exists / isn't compatible) render as 0 so the
   * shape of the funnel still communicates the configured pipeline.
   */
  stages?: Array<{ id: string; label: string; queryId: string | null }>;
  /**
   * Widget-level filter overlay. AND'd with the bound query's own
   * `config.filters` at execute time. Lets one saved query power
   * multiple widgets with different scopes (e.g. "Closed Won this
   * month" + "Closed Won Sales team" from the same metric). Schema
   * matches QueryConfig.filters.
   */
  filters?: import("@/lib/queries/ast").Filter[];
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

  // Funnel is the one widget type that ignores the top-level
  // `widget.queryId` binding — its data comes from `display.stages`,
  // a query per stage. Short-circuit the standard executor flow and
  // hand off to the dedicated renderer.
  if (widget.type === "funnel") {
    return (
      <FunnelTile
        dashboardId={dashboardId}
        workspaceId={workspaceId}
        widget={widget}
        display={display}
        editable={editable}
      />
    );
  }

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
        //
        // `extraFilters` layers any widget-defined filter overlay on
        // top of the query's own filters (AND'd in the executor).
        {
          dateOverride: display.timePeriod
            ? toDateWindow(display.timePeriod)
            : undefined,
          extraFilters:
            display.filters && display.filters.length > 0
              ? display.filters
              : undefined,
        },
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
            currentFilters={display.filters}
            boundQuerySource={bound ? (bound.source as "stripe" | "hubspot") : undefined}
            boundQueryMetric={
              bound ? ((bound.config as { metric: string }).metric) : undefined
            }
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
        (() => {
          // Drizzle's inferred JSON type loses the AST shape — cast.
          const spec = (
            bound?.config as
              | {
                  conditionalColors?: {
                    colors: readonly [string, string, string];
                    thresholds: readonly [number, number];
                  };
                }
              | undefined
          )?.conditionalColors;
          return renderBound(widget, display, executorResult, {
            // Single-shot color for Single/Gauge widgets (computed
            // against display.target). Ranking uses the full spec to
            // pick per-row colors against the dataset max instead.
            conditionalColor:
              executorResult.kind === "single"
                ? pickConditionalColor(
                    executorResult.value ?? 0,
                    display.target,
                    spec,
                  )
                : null,
            conditionalColorsSpec: spec,
          });
        })()
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
  opts: {
    conditionalColor: string | null;
    conditionalColorsSpec?: {
      colors: readonly [string, string, string];
      thresholds: readonly [number, number];
    };
  } = { conditionalColor: null },
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
            formatted={p.formatted}
            valueColor={opts.conditionalColor}
          />
        );
      }
    case "gauge":
      if (res.kind !== "single") return null;
      {
        const p = adaptGauge(res, display);
        return (
          <GaugeChart
            value={p.value}
            target={p.target}
            color={opts.conditionalColor}
          />
        );
      }
    case "bar":
      if (res.kind !== "timeseries") return null;
      return <BarChart data={adaptBar(res)} />;
    case "ranking":
      if (res.kind !== "groupby") return null;
      return (
        <RankingWidget
          reps={adaptRanking(res, opts.conditionalColorsSpec)}
        />
      );
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

// ─────────────────────────────────────────────────────────────────────────────
// Funnel — one (label, queryId) per stage. Top-level widget.queryId is
// ignored for funnel widgets; the operator configures stages in the
// "Funnel stages" tab of Edit widget.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server component that fans out per-stage queries in parallel.
 *
 * Each stage's saved query must return `kind: "single"` — we only need a
 * value per stage. Unbound stages or stages whose query no longer
 * matches the workspace render as 0 so the funnel shape stays stable
 * (and the operator can see which stages still need wiring).
 *
 * When `display.stages` is missing or empty, we fall back to the SEED
 * funnel so the widget keeps a useful preview before the operator
 * configures it.
 */
async function FunnelTile({
  dashboardId,
  workspaceId,
  widget,
  display,
  editable,
}: {
  dashboardId: string;
  workspaceId: string;
  widget: Widget;
  display: WidgetDisplay;
  editable: boolean;
}) {
  const stages = display.stages ?? [];
  const resolvedTitle = resolveTitle(display, "funnel", undefined);

  // Pull every stage's saved query in one round-trip so we don't N+1
  // the queries table when a funnel has many stages.
  const queryIds = stages
    .map((s) => s.queryId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const rows = queryIds.length
    ? await db
        .select({
          id: queriesTable.id,
          config: queriesTable.config,
        })
        .from(queriesTable)
        .where(
          and(
            eq(queriesTable.workspaceId, workspaceId),
            inArray(queriesTable.id, queryIds),
          ),
        )
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Run each bound stage in parallel. Stages that are unbound,
  // missing, or non-single get a value of 0 — the funnel still
  // renders the operator's chosen shape.
  const runs = await Promise.all(
    stages.map(async (s) => {
      if (!s.queryId) return { label: s.label, value: 0 };
      const q = byId.get(s.queryId);
      if (!q) return { label: s.label, value: 0 };
      try {
        const res = await runQuery(
          workspaceId,
          q.config as Parameters<typeof runQuery>[1],
          {
            dateOverride: display.timePeriod
              ? toDateWindow(display.timePeriod)
              : undefined,
            // Funnel-level extra filters apply to every stage so the
            // whole pipeline gets scoped together — e.g. "Sales team
            // only" filters all of Leads → MQL → SQL → Won at once.
            extraFilters:
              display.filters && display.filters.length > 0
                ? display.filters
                : undefined,
          },
        );
        if (res.kind !== "single") {
          // Wrong query shape — render 0 rather than throwing so the
          // funnel can keep working while the operator fixes the
          // binding.
          return { label: s.label, value: 0 };
        }
        const value = res.formatter === "EUR-cents" ? (res.value ?? 0) / 100 : (res.value ?? 0);
        return {
          label: s.label,
          value,
          formatted: res.formatted ?? undefined,
        };
      } catch {
        return { label: s.label, value: 0 };
      }
    }),
  );

  // No configured stages → SEED preview. Keeps the empty funnel from
  // looking broken on a fresh widget.
  const stagesForChart =
    stages.length === 0 ? [...SEED.funnel] : runs;

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
            widgetType="funnel"
            widgetName={resolvedTitle}
            hasBinding={stages.length > 0}
            currentTitle={display.title ?? resolvedTitle}
            currentTitleSize={display.titleSize}
            currentTitleAlign={display.titleAlign}
            currentChip={display.chip}
            currentTimePeriod={display.timePeriod}
            currentTarget={display.target}
            currentStages={stages}
          />
        ) : undefined
      }
    >
      <FunnelChart stages={stagesForChart} />
    </WidgetShell>
  );
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
