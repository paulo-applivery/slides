import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { Icons } from "@/components/ui/Icon";
import { listDashboards } from "@/lib/dashboards";
import { canEdit, type Role } from "@/lib/roles";
import { NewDashboardButton } from "@/components/dashboard/NewDashboardButton";
import { DashboardCardMenu } from "@/components/dashboard/DashboardCardMenu";

/** Dashboards list — backed by the Drizzle dashboards table. */
export default async function DashboardsListPage() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  const role = (session?.user?.role ?? null) as Role | null;
  const editable = canEdit(role);

  const items = workspaceId ? await listDashboards(workspaceId) : [];
  const ownerInitials = initialsFromName(session?.user?.name);

  return (
    <>
      <TopBar
        crumbs={[]}
        name="Dashboards"
        actions={editable ? <NewDashboardButton /> : null}
      />
      <main className="main">
        {items.length === 0 ? (
          <EmptyState editable={editable} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {items.map((d) => (
              <div key={d.id} style={{ position: "relative" }}>
                <Link
                  href={`/dashboards/${d.id}`}
                  className="card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    textDecoration: "none",
                    transition: "all 140ms ease-out",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 8,
                        background: "var(--primary-soft)",
                        color: "var(--primary)",
                      }}
                    >
                      <Icons.Dashboard size={18} variant="bold" />
                    </span>
                    <div>
                      <div className="t-h4">{d.name}</div>
                      <div className="t-small">
                        {d.widgetCount} widgets · updated{" "}
                        {formatDistanceToNow(d.updatedAt, { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: 14,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <span className="badge badge-success">
                      <span className="dot" />
                      Live
                    </span>
                    <div
                      className="avatar"
                      style={{ width: 26, height: 26, fontSize: 11 }}
                    >
                      {ownerInitials}
                    </div>
                  </div>
                </Link>
                {editable && (
                  <div style={{ position: "absolute", top: 14, right: 14 }}>
                    <DashboardCardMenu id={d.id} name={d.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function EmptyState({ editable }: { editable: boolean }) {
  return (
    <div
      className="card"
      style={{
        textAlign: "center",
        padding: 48,
        maxWidth: 520,
        margin: "32px auto",
      }}
    >
      <h2 className="t-h3" style={{ marginBottom: 6 }}>
        No dashboards yet
      </h2>
      <p
        className="t-body"
        style={{ marginBottom: 20, color: "var(--text-tertiary)" }}
      >
        {editable
          ? "Connect Stripe or HubSpot to start building live revenue boards."
          : "An admin or editor needs to create the first dashboard before you can view it here."}
      </p>
      {editable && <NewDashboardButton label="Create your first dashboard" />}
    </div>
  );
}

function initialsFromName(name?: string | null): string {
  if (!name) return "•";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
