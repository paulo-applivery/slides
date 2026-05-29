/**
 * Shared data fetcher for TV mode.
 *
 * Used by:
 *   - `GET /api/tv/data` (client polls this with a tv_session token)
 *   - `/tv/[id]/page.tsx` (server-renders for signed-in editors so they
 *     bypass the QR flow entirely)
 *
 * Returns the slideshow + every dashboard it references AND every bound
 * widget's pre-computed result. Workspace scoping is enforced by the
 * caller — this helper trusts the workspaceId argument.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dashboards,
  queries,
  slideshows,
  type DashboardLayout,
  type Slide,
} from "@/lib/db/schema";
import { runQuery, type ExecutorResult } from "@/lib/queries/executor";
import { resolveTimePeriod, type TimePeriod } from "@/lib/timePeriod";
import type { Filter, QueryConfig } from "@/lib/queries/ast";
import {
  objectFromMetricId,
  type SourceObject,
} from "@/lib/queries/catalog";

/**
 * Mirrors `WidgetTile.pickExtraFilters` — pick the per-object filter
 * list if present, fall back to the legacy flat `filters` array. Kept
 * inline here because tv/data.ts is server-only and WidgetTile is a
 * server component too; the duplication is small and the alternative
 * is a third "shared widget util" module.
 */
function pickExtraFilters(
  display:
    | {
        filters?: Filter[];
        filtersByObject?: Partial<Record<SourceObject, Filter[]>>;
      }
    | undefined,
  object: SourceObject,
): Filter[] | undefined {
  const perObject = display?.filtersByObject?.[object];
  if (perObject && perObject.length > 0) return perObject;
  const legacy = display?.filters;
  if (legacy && legacy.length > 0) return legacy;
  return undefined;
}

export type TvWidgetResult =
  | {
      kind: "ok";
      result: ExecutorResult;
      /**
       * Carry the bound query's conditional-color spec through to the
       * TV renderer. Pre-resolving the hex would be cleaner but it
       * depends on `display.target` per-widget which already lives on
       * the layout — so the TV slide does the final pick.
       */
      conditionalColors?: {
        colors: [string, string, string];
        thresholds: [number, number];
      };
    }
  | { kind: "error"; error: string }
  | { kind: "unbound" }
  /**
   * Funnel widgets resolve N queries per widget (one per stage) and
   * ship the resolved stage list pre-baked. The TV renderer just
   * pipes it into `<FunnelChart stages={…}/>`.
   */
  | {
      kind: "funnel-ok";
      stages: Array<{
        label: string;
        value: number;
        formatted?: string;
        color?: string;
      }>;
    };

export type TvDashboard = {
  id: string;
  name: string;
  layout: DashboardLayout | null;
  /** The dashboard's stored light/dark — applied while this slide plays. */
  theme: "light" | "dark";
  widgetResults: Record<string, TvWidgetResult>;
};

export type TvData = {
  slideshow: { id: string; name: string; slides: Slide[] };
  dashboardsById: Record<string, TvDashboard>;
  workspaceName: string;
  /**
   * Monotonic revision = max `updatedAt` (epoch ms) across the slideshow
   * and every dashboard it references. The TV polls `/api/tv/version` for
   * this cheaply and refetches the full payload only when it climbs — so
   * an editor's slide/dashboard change reaches every paired screen within
   * one poll interval instead of waiting on the 60s data refresh.
   */
  rev: number;
};

export async function fetchTvSlideshowData(
  workspaceId: string,
  slideshowId: string,
): Promise<TvData | null> {
  const ss = await db.query.slideshows.findFirst({
    where: eq(slideshows.id, slideshowId),
  });
  if (!ss || ss.workspaceId !== workspaceId) return null;

  // Collect dashboards referenced by the slideshow's dashboard slides.
  const dashboardIds = Array.from(
    new Set(
      ss.slides
        .filter(
          (s): s is {
            id: string;
            type: "dashboard";
            dashboardId: string;
            durationSec: number;
            transition: "crossfade" | "slide" | "cut";
          } => s.type === "dashboard",
        )
        .map((s) => s.dashboardId),
    ),
  );

  const refs = dashboardIds.length
    ? await db
        .select({
          id: dashboards.id,
          name: dashboards.name,
          layout: dashboards.layout,
          theme: dashboards.theme,
          updatedAt: dashboards.updatedAt,
        })
        .from(dashboards)
        .where(
          and(
            eq(dashboards.workspaceId, workspaceId),
            inArray(dashboards.id, dashboardIds),
          ),
        )
    : [];

  // One round-trip for every query referenced by any widget on any of those
  // dashboards. Avoids N+1. Funnel widgets contribute one id per stage
  // (in addition to the top-level binding, which they ignore — keeping
  // it in the union is harmless).
  const allQueryIds = Array.from(
    new Set(
      refs
        .flatMap((d) => d.layout?.widgets ?? [])
        .flatMap((w) => {
          const ids: string[] = [];
          if (w.queryId) ids.push(w.queryId);
          const stages = (w.display as { stages?: Array<{ queryId: string | null }> } | undefined)
            ?.stages;
          if (stages) {
            for (const s of stages) {
              if (s.queryId) ids.push(s.queryId);
            }
          }
          return ids;
        }),
    ),
  );
  const queryRows = allQueryIds.length
    ? await db
        .select({ id: queries.id, config: queries.config })
        .from(queries)
        .where(
          and(
            eq(queries.workspaceId, workspaceId),
            inArray(queries.id, allQueryIds),
          ),
        )
    : [];
  const queryById = new Map(queryRows.map((q) => [q.id, q]));

  // Fan out every widget's bound query in parallel.
  const runs = refs.flatMap((d) => {
    const widgets = d.layout?.widgets ?? [];
    return widgets.map(async (w) => {
      // Funnel: each stage runs its own query (or contributes 0). The
      // TV renderer treats this as a pre-baked stages array rather
      // than an ExecutorResult — funnels have no equivalent
      // executor kind.
      if (w.type === "funnel") {
        const stages =
          (
            w.display as
              | {
                  stages?: Array<{
                    id: string;
                    label: string;
                    queryId: string | null;
                    dateField?: string;
                    timePeriod?: TimePeriod;
                    color?: string;
                  }>;
                }
              | undefined
          )?.stages ?? [];
        if (stages.length === 0) {
          // No stages configured — let the renderer fall back to SEED.
          return [d.id, w.id, { kind: "unbound" as const }] as const;
        }
        const wDisplay = w.display as
          | {
              timePeriod?: TimePeriod;
              filters?: Filter[];
              filtersByObject?: Partial<Record<SourceObject, Filter[]>>;
            }
          | undefined;
        const widgetTp = wDisplay?.timePeriod;
        const stageResults = await Promise.all(
          stages.map(async (s) => {
            if (!s.queryId) return { label: s.label, value: 0, color: s.color };
            const q = queryById.get(s.queryId);
            if (!q) return { label: s.label, value: 0, color: s.color };
            try {
              // Per-stage filter routing — a contacts stage gets
              // contact filters, a deals stage gets deal filters.
              // The exact same logic WidgetTile applies in-app.
              const baseCfg = q.config as QueryConfig;
              const stageObject = objectFromMetricId(
                baseCfg.source,
                baseCfg.metric,
              );
              // Per-stage dateField override — see WidgetTile for the
              // closeDate vs createdAt motivation.
              const cfg = s.dateField
                ? ({
                    ...baseCfg,
                    dateField: s.dateField,
                  } as QueryConfig)
                : baseCfg;
              // Per-stage timePeriod wins over the widget-level one.
              const effectiveTp = s.timePeriod ?? widgetTp;
              const res = await runQuery(workspaceId, cfg, {
                dateOverride: effectiveTp
                  ? toDateWindow(effectiveTp)
                  : undefined,
                extraFilters: pickExtraFilters(wDisplay, stageObject),
              });
              if (res.kind !== "single") {
                return { label: s.label, value: 0, color: s.color };
              }
              const value =
                res.formatter === "EUR-cents"
                  ? (res.value ?? 0) / 100
                  : (res.value ?? 0);
              return {
                label: s.label,
                value,
                formatted: res.formatted ?? undefined,
                color: s.color,
              };
            } catch {
              return { label: s.label, value: 0, color: s.color };
            }
          }),
        );
        return [
          d.id,
          w.id,
          { kind: "funnel-ok" as const, stages: stageResults },
        ] as const;
      }

      if (!w.queryId) {
        return [d.id, w.id, { kind: "unbound" as const }] as const;
      }
      const q = queryById.get(w.queryId);
      if (!q) {
        return [d.id, w.id, { kind: "unbound" as const }] as const;
      }
      try {
        // Same per-widget overrides as `WidgetTile`: time period AND
        // extra filters get passed to the executor so TV results
        // match the in-app preview. Without this, TV uses the saved
        // query's defaults and looks "different" from the editor.
        // Per-object filter routing uses `pickExtraFilters` (see helper).
        const wDisplay = w.display as
          | {
              timePeriod?: TimePeriod;
              filters?: Filter[];
              filtersByObject?: Partial<Record<SourceObject, Filter[]>>;
            }
          | undefined;
        const tp = wDisplay?.timePeriod;
        const cfg = q.config as QueryConfig;
        const queryObject = objectFromMetricId(cfg.source, cfg.metric);
        const res = await runQuery(workspaceId, cfg, {
          dateOverride: tp ? toDateWindow(tp) : undefined,
          extraFilters: pickExtraFilters(wDisplay, queryObject),
        });
        // Forward the conditional-color spec so the TV renderer can
        // resolve the hex against the widget's `display.target`.
        // (`cfg` already declared above for the per-object filter
        // routing — reuse it here instead of redeclaring.)
        const conditionalColors = cfg.conditionalColors as
          | { colors: [string, string, string]; thresholds: [number, number] }
          | undefined;
        return [
          d.id,
          w.id,
          { kind: "ok" as const, result: res, conditionalColors },
        ] as const;
      } catch (err) {
        return [
          d.id,
          w.id,
          {
            kind: "error" as const,
            error: err instanceof Error ? err.message : String(err),
          },
        ] as const;
      }
    });
  });
  const results = await Promise.all(runs);

  const dashboardsById: Record<string, TvDashboard> = {};
  for (const d of refs) {
    dashboardsById[d.id] = {
      id: d.id,
      name: d.name,
      layout: d.layout,
      theme: d.theme,
      widgetResults: {},
    };
  }
  for (const [dashboardId, widgetId, res] of results) {
    if (dashboardsById[dashboardId]) {
      dashboardsById[dashboardId].widgetResults[widgetId] = res;
    }
  }

  // Revision = newest edit across the slideshow + its dashboards. The
  // client seeds its baseline from this so the version poll never fires a
  // redundant refetch right after a fresh load.
  const rev = Math.max(
    ss.updatedAt.getTime(),
    ...refs.map((d) => d.updatedAt.getTime()),
  );

  return {
    slideshow: {
      id: ss.id,
      name: ss.name,
      slides: ss.slides,
    },
    dashboardsById,
    workspaceName: "Workspace",
    rev,
  };
}

/**
 * Cheap revision probe for `/api/tv/version`. Returns the same `rev` as
 * {@link fetchTvSlideshowData} (max `updatedAt` across the slideshow + its
 * referenced dashboards) but WITHOUT running any widget queries — just two
 * indexed reads — so the TV can poll it frequently. Returns `null` when the
 * slideshow is missing or owned by another workspace.
 */
export async function fetchTvRevision(
  workspaceId: string,
  slideshowId: string,
): Promise<number | null> {
  const ss = await db.query.slideshows.findFirst({
    where: eq(slideshows.id, slideshowId),
    columns: { workspaceId: true, slides: true, updatedAt: true },
  });
  if (!ss || ss.workspaceId !== workspaceId) return null;

  const dashboardIds = Array.from(
    new Set(
      ss.slides
        .filter(
          (s): s is Extract<Slide, { type: "dashboard" }> =>
            s.type === "dashboard",
        )
        .map((s) => s.dashboardId),
    ),
  );

  let rev = ss.updatedAt.getTime();
  if (dashboardIds.length) {
    const rows = await db
      .select({ updatedAt: dashboards.updatedAt })
      .from(dashboards)
      .where(
        and(
          eq(dashboards.workspaceId, workspaceId),
          inArray(dashboards.id, dashboardIds),
        ),
      );
    for (const r of rows) rev = Math.max(rev, r.updatedAt.getTime());
  }
  return rev;
}

/**
 * Resolve a widget `TimePeriod` to the {from, to} window the executor
 * understands. Same logic as `WidgetTile.toDateWindow` — kept inlined
 * (rather than shared via a util) because TV is server-side / RSC-only
 * and WidgetTile is server-side / app-only; the duplication is small
 * and the alternative is a third file just to hold one helper.
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
