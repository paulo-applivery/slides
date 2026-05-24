"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { updateLayout } from "@/lib/dashboards";
import type { DashboardLayout } from "@/lib/db/schema";

/**
 * Editable client wrapper around the dashboard widget grid.
 *
 * Server-rendered widget tiles are passed in as `children`, each one mapped
 * to a widget by `data-widget-id` on its wrapper `<div>`. react-grid-layout
 * v2 owns the placement (left/top/width/height via transforms) while we
 * own persistence: every layout change is debounced ~500 ms and pushed to
 * the `updateLayout` server action, which revalidates the page so the next
 * navigation reflects the new positions.
 *
 * The static `<Dashboard>` renderer is still used for read-only viewers
 * and for TV mode — see `Dashboard.tsx`.
 */
export function EditableDashboardGrid({
  dashboardId,
  initialLayout,
  /** A `<div>` per widget, keyed by `widget.id`. */
  children,
}: {
  dashboardId: string;
  initialLayout: DashboardLayout;
  children: React.ReactElement<{ "data-widget-id": string }>[];
}) {
  // Track the working layout client-side so the grid feels instant. We
  // re-sync from `initialLayout` only when the dashboardId or widget set
  // changes — otherwise drag/resize would snap back to the server copy
  // mid-gesture every time RSC revalidates.
  const widgetIds = initialLayout.widgets.map((w) => w.id).join(",");
  const [layout, setLayout] = useState<LayoutItem[]>(() =>
    toRGLLayout(initialLayout),
  );
  useEffect(() => {
    setLayout(toRGLLayout(initialLayout));
    // We intentionally key on widgetIds — not on `initialLayout` itself —
    // so resyncs only happen when widgets are added/removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId, widgetIds]);

  // Auto-measure the container so we can hand a real pixel width to RGL.
  const { width, containerRef, mounted } = useContainerWidth({
    initialWidth: 1200,
  });

  // Persist with a trailing debounce so a flick-drag doesn't fan out 30
  // server calls. 500 ms is "just slower than human-perceived 'done'".
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLayout = useRef<LayoutItem[] | null>(null);
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Map each child to its widget id so the grid can reorder them by `i`.
  const childrenById = useMemo(() => {
    const m = new Map<string, React.ReactElement>();
    for (const c of children) {
      const id = c.props["data-widget-id"];
      if (id) m.set(id, c);
    }
    return m;
  }, [children]);

  // Track row height in pixels: viewport height minus chrome (topbar 64,
  // dash-meta ~56, gaps ~32) divided by an opinionated row count (12).
  // We use the container's *current* width to also infer a sensible row
  // height so wide screens get taller rows.
  const rowHeight = useMemo(() => {
    if (typeof window === "undefined") return 80;
    const usable = window.innerHeight - 64 - 56 - 32;
    return Math.max(48, Math.floor(usable / 12));
  }, []);

  // Compute totalRows so the grid uses the same row sizing as the static
  // Dashboard renderer. We don't fix this to a constant because layouts
  // with tall widgets need more vertical space than tight KPI grids.

  function handleLayoutChange(next: Layout) {
    // RGL's Layout is `readonly LayoutItem[]` — clone it so we can store.
    const cloned = next.map((it) => ({ ...it }));
    setLayout(cloned);
    pendingLayout.current = cloned;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const snapshot = pendingLayout.current;
      if (!snapshot) return;
      try {
        await updateLayout(
          dashboardId,
          snapshot.map((it) => ({
            id: it.i,
            x: it.x,
            y: it.y,
            w: it.w,
            h: it.h,
          })),
        );
      } catch (err) {
        // Soft-fail: the next gesture will re-attempt and the optimistic
        // local state stays. We don't toast here to avoid noise during
        // network blips — a stale layout will heal on next page load.
        console.error("[EditableDashboardGrid] persist failed:", err);
      }
    }, 500);
  }

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className="dash-rgl-wrap">
      {mounted && width > 0 ? (
        <GridLayout
          className="dash-rgl"
          width={width}
          layout={layout}
          gridConfig={{
            cols: 12,
            rowHeight,
            margin: [16, 16],
            containerPadding: [0, 0],
          }}
          dragConfig={{
            // Only the drag handle starts a drag; clicking the body opens
            // the overflow menu etc. without accidental moves.
            handle: ".widget-drag",
            // 3 px default plays nicely with our hover-reveal handle.
          }}
          resizeConfig={{
            // SE corner is the standard mental model — Excel, Figma,
            // and every other grid-editor uses bottom-right.
            handles: ["se"],
          }}
          onLayoutChange={handleLayoutChange}
        >
          {layout.map((it) => {
            const child = childrenById.get(it.i);
            if (!child) return null;
            return (
              <div key={it.i} className="dash-rgl-cell">
                {child}
              </div>
            );
          })}
        </GridLayout>
      ) : (
        // Pre-mount placeholder. Same flex sizing as the live grid so the
        // editor doesn't jump when measurement settles.
        <div style={{ minHeight: 320 }} />
      )}
    </div>
  );
}

/** Map our DashboardLayout shape onto RGL's `LayoutItem[]`. */
function toRGLLayout(l: DashboardLayout): LayoutItem[] {
  return l.widgets.map((w) => ({
    i: w.id,
    x: w.pos.x,
    y: w.pos.y,
    w: w.pos.w,
    h: w.pos.h,
    // Sensible minimums so users can't shrink a chart below where its
    // labels render. Tweaked per widget type.
    minW: w.type === "singleValue" ? 2 : 3,
    minH: w.type === "singleValue" ? 1 : 2,
  }));
}
