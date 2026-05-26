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
import type { QueryConfig } from "@/lib/queries/ast";

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
      stages: Array<{ label: string; value: number; formatted?: string }>;
    };

export type TvDashboard = {
  id: string;
  name: string;
  layout: DashboardLayout | null;
  widgetResults: Record<string, TvWidgetResult>;
};

export type TvData = {
  slideshow: { id: string; name: string; slides: Slide[] };
  dashboardsById: Record<string, TvDashboard>;
  workspaceName: string;
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
          (w.display as { stages?: Array<{ id: string; label: string; queryId: string | null }> } | undefined)
            ?.stages ?? [];
        if (stages.length === 0) {
          // No stages configured — let the renderer fall back to SEED.
          return [d.id, w.id, { kind: "unbound" as const }] as const;
        }
        const wDisplay = w.display as
          | {
              timePeriod?: TimePeriod;
              filters?: import("@/lib/queries/ast").Filter[];
            }
          | undefined;
        const tp = wDisplay?.timePeriod;
        const extra = wDisplay?.filters;
        const override = {
          dateOverride: tp ? toDateWindow(tp) : undefined,
          extraFilters: extra && extra.length > 0 ? extra : undefined,
        };
        const stageResults = await Promise.all(
          stages.map(async (s) => {
            if (!s.queryId) return { label: s.label, value: 0 };
            const q = queryById.get(s.queryId);
            if (!q) return { label: s.label, value: 0 };
            try {
              const res = await runQuery(
                workspaceId,
                q.config as QueryConfig,
                override,
              );
              if (res.kind !== "single") {
                return { label: s.label, value: 0 };
              }
              const value =
                res.formatter === "EUR-cents"
                  ? (res.value ?? 0) / 100
                  : (res.value ?? 0);
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
        const wDisplay = w.display as
          | {
              timePeriod?: TimePeriod;
              filters?: import("@/lib/queries/ast").Filter[];
            }
          | undefined;
        const tp = wDisplay?.timePeriod;
        const extra = wDisplay?.filters;
        const res = await runQuery(workspaceId, q.config as QueryConfig, {
          dateOverride: tp ? toDateWindow(tp) : undefined,
          extraFilters: extra && extra.length > 0 ? extra : undefined,
        });
        // Forward the conditional-color spec so the TV renderer can
        // resolve the hex against the widget's `display.target`.
        const cfg = q.config as QueryConfig;
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
      widgetResults: {},
    };
  }
  for (const [dashboardId, widgetId, res] of results) {
    if (dashboardsById[dashboardId]) {
      dashboardsById[dashboardId].widgetResults[widgetId] = res;
    }
  }

  return {
    slideshow: {
      id: ss.id,
      name: ss.name,
      slides: ss.slides,
    },
    dashboardsById,
    workspaceName: "Workspace",
  };
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
