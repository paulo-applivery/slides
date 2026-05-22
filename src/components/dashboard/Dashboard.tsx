import { Icons } from "@/components/ui/Icon";
import { SEED } from "@/lib/seed";
import { WidgetTile } from "./WidgetTile";
import { AddWidgetButton } from "./AddWidgetButton";
import type { DashboardLayout } from "@/lib/db/schema";

/**
 * Layout-driven demo dashboard.
 *
 * Iterates `layout.widgets` and renders a `<WidgetTile>` per entry. Each
 * tile resolves its own bound query (or falls back to SEED) — see
 * WidgetTile for the data path.
 *
 * Widgets are placed by explicit `gridColumn` / `gridRow` derived from
 * `pos.x/y/w/h` so the layout structure here matches what `<TVMode>` will
 * render. Rows are equal-fraction (`minmax(0, 1fr)`) and the grid is
 * height-constrained to the viewport so the in-app editor is a faithful
 * preview of the TV — no widget renders off-screen.
 */
function RangePill({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="range-pill">
      {icon && <span className="range-pill-icon">{icon}</span>}
      {children}
    </span>
  );
}

export function Dashboard({
  dashboardId,
  workspaceId,
  layout,
  editable,
}: {
  dashboardId: string;
  workspaceId: string;
  layout: DashboardLayout;
  editable: boolean;
}) {
  const widgets = layout.widgets;
  const totalRows = Math.max(1, ...widgets.map((w) => w.pos.y + w.pos.h));

  return (
    <div
      className="main"
      style={{
        // Match the TV viewport: the dashboard always fits the visible
        // area underneath the topbar. `.main` has overflow: auto from the
        // shell, but we constrain the grid to the viewport so the editor
        // doubles as a TV preview.
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div className="dash-meta">
        <div className="dash-meta-l">
          <RangePill icon={<Icons.Calendar size={14} />}>{SEED.range}</RangePill>
          <RangePill>This month · Daily buckets</RangePill>
          <span className="badge badge-success">
            <span className="dot" />
            Live
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm">
            <Icons.Refresh size={14} /> Refresh all
          </button>
          {editable && <AddWidgetButton dashboardId={dashboardId} />}
        </div>
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
            <WidgetTile
              dashboardId={dashboardId}
              workspaceId={workspaceId}
              widget={w}
              editable={editable}
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
