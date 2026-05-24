import { Icons } from "@/components/ui/Icon";
import { SEED } from "@/lib/seed";
import { WidgetTile } from "./WidgetTile";
import { AddWidgetButton } from "./AddWidgetButton";
import { EditableDashboardGrid } from "./EditableDashboardGrid";
import type { DashboardLayout } from "@/lib/db/schema";

/**
 * Layout-driven dashboard renderer.
 *
 * Two paths:
 *  - **Editable**: hands the server-rendered tiles to `<EditableDashboardGrid>`,
 *    which wraps them with react-grid-layout so the operator can drag and
 *    resize. Layout changes are debounced + persisted to the DB.
 *  - **Read-only**: renders the same tiles inside a fit-to-screen CSS grid
 *    (`grid-template-rows: repeat(N, minmax(0, 1fr))`) so the editor is a
 *    faithful preview of `<TVMode>` and no widget can fall off-screen.
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

  // Server-render each tile once. Both branches consume the same array —
  // we just wrap them in different layout primitives.
  const tiles = widgets.map((w) => (
    <div key={w.id} data-widget-id={w.id} className="dash-cell">
      <WidgetTile
        dashboardId={dashboardId}
        workspaceId={workspaceId}
        widget={w}
        editable={editable}
      />
    </div>
  ));

  return (
    <div
      className="main"
      style={{
        // Match the TV viewport when read-only: the dashboard fits the
        // visible area underneath the topbar so the editor doubles as a
        // TV preview. In edit mode the grid scrolls instead.
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

      {editable ? (
        <EditableDashboardGrid
          dashboardId={dashboardId}
          initialLayout={layout}
        >
          {tiles}
        </EditableDashboardGrid>
      ) : (
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
      )}
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
