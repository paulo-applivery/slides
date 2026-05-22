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
import type { QueryConfig } from "@/lib/queries/ast";

export type TvWidgetResult =
  | { kind: "ok"; result: ExecutorResult }
  | { kind: "error"; error: string }
  | { kind: "unbound" };

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
  // dashboards. Avoids N+1.
  const allQueryIds = Array.from(
    new Set(
      refs
        .flatMap((d) => d.layout?.widgets ?? [])
        .flatMap((w) => (w.queryId ? [w.queryId] : [])),
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
      if (!w.queryId) {
        return [d.id, w.id, { kind: "unbound" as const }] as const;
      }
      const q = queryById.get(w.queryId);
      if (!q) {
        return [d.id, w.id, { kind: "unbound" as const }] as const;
      }
      try {
        const res = await runQuery(workspaceId, q.config as QueryConfig);
        return [d.id, w.id, { kind: "ok" as const, result: res }] as const;
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
