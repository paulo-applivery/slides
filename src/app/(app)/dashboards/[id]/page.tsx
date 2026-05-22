import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { EmptyCanvas } from "@/components/dashboard/EmptyCanvas";
import { InlineRename } from "@/components/dashboard/InlineRename";
import { AddWidgetButton } from "@/components/dashboard/AddWidgetButton";
import { Icons } from "@/components/ui/Icon";
import { getDashboard } from "@/lib/dashboards";
import { canEdit, type Role } from "@/lib/roles";

/**
 * Dashboard detail page.
 *
 * The widget layout drives rendering — each `<WidgetTile>` resolves its own
 * bound query (or falls back to SEED). New widgets ship empty; users bind
 * them via the per-widget overflow menu.
 *
 * Drag/drop reordering lands in Phase 3 slice 2.
 */
export default async function DashboardDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const dashboard = await getDashboard(session.user.workspaceId, params.id);
  if (!dashboard) notFound();

  const role = (session.user.role ?? null) as Role | null;
  const editable = canEdit(role);
  const layout = dashboard.layout ?? { widgets: [] };
  const hasWidgets = layout.widgets.length > 0;

  return (
    <>
      <TopBar
        crumbs={["Dashboards"]}
        name={
          <InlineRename
            id={dashboard.id}
            initialName={dashboard.name}
            editable={editable}
          />
        }
        actions={
          <>
            <button className="btn btn-ghost">
              <Icons.Share size={14} /> Share
            </button>
            <button className="btn">
              <Icons.TV size={14} /> Launch on TV
            </button>
            {editable && (
              <button className="btn btn-primary">
                <Icons.Save size={14} /> Save
              </button>
            )}
          </>
        }
      />
      {hasWidgets ? (
        <Dashboard
          dashboardId={dashboard.id}
          workspaceId={session.user.workspaceId}
          layout={layout}
          editable={editable}
        />
      ) : (
        <EmptyCanvas
          editable={editable}
          cta={editable ? <AddWidgetButton dashboardId={dashboard.id} primary /> : null}
        />
      )}
    </>
  );
}
