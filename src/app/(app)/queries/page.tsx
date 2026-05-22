import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { Icons } from "@/components/ui/Icon";
import { listQueries } from "@/lib/queries/actions";
import { canEdit, type Role } from "@/lib/roles";
import { QueryRowMenu } from "@/components/queries/QueryRowMenu";

/**
 * Saved queries — list view. Editors + admins see a "New query" CTA and a
 * per-row overflow menu (run / delete); viewers see the list read-only.
 */
export default async function QueriesPage() {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const role = (session.user.role ?? null) as Role | null;
  const editable = canEdit(role);
  const rows = await listQueries();

  return (
    <>
      <TopBar
        crumbs={[]}
        name="Queries"
        actions={
          editable ? (
            <Link href="/queries/new" className="btn btn-primary">
              <Icons.Plus size={14} /> New query
            </Link>
          ) : null
        }
      />
      <main className="main">
        <p
          className="t-body"
          style={{ color: "var(--text-tertiary)", margin: "0 0 24px", maxWidth: 640 }}
        >
          A saved query computes a single number (revenue, count, distinct
          customers) from a connected data source. Bind queries to widgets to
          drive your dashboards.
        </p>

        {rows.length === 0 ? (
          <EmptyState editable={editable} />
        ) : (
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-2xl)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px 160px 220px 48px",
                gap: 16,
                padding: "12px 20px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-elev-2)",
              }}
              className="t-micro"
            >
              <span>Name</span>
              <span>Source</span>
              <span>Last run</span>
              <span style={{ textAlign: "right" }}>Result</span>
              <span />
            </div>
            {rows.map((q) => (
              <div
                key={q.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 160px 220px 48px",
                  gap: 16,
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                  {q.name}
                </span>
                <span>
                  <span
                    className="badge"
                    style={{
                      color: q.source === "stripe" ? "var(--stripe)" : "var(--hubspot)",
                      background: "var(--bg-elev-2)",
                    }}
                  >
                    <span
                      className="dot"
                      style={{
                        background: q.source === "stripe" ? "var(--stripe)" : "var(--hubspot)",
                      }}
                    />
                    {q.source}
                  </span>
                </span>
                <span className="t-small">
                  {q.lastRunAt
                    ? formatDistanceToNow(q.lastRunAt, { addSuffix: true })
                    : "never"}
                </span>
                <span
                  className="t-mono"
                  style={{
                    color: q.lastResult?.error ? "var(--danger)" : "var(--text-primary)",
                    textAlign: "right",
                    fontWeight: 500,
                  }}
                >
                  {q.lastResult?.error ? "error" : q.lastResult?.summary ?? "—"}
                </span>
                {editable && <QueryRowMenu id={q.id} name={q.name} />}
                {!editable && <span />}
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
      style={{ textAlign: "center", padding: 48, maxWidth: 520, margin: "32px auto" }}
    >
      <h2 className="t-h3" style={{ marginBottom: 6 }}>
        No queries yet
      </h2>
      <p
        className="t-body"
        style={{ marginBottom: 20, color: "var(--text-tertiary)" }}
      >
        {editable
          ? "Save your first query against Stripe or HubSpot — bind it to a widget in Phase 3."
          : "An editor or admin will save the workspace's first query here."}
      </p>
      {editable && (
        <Link href="/queries/new" className="btn btn-primary">
          <Icons.Plus size={14} /> Save your first query
        </Link>
      )}
    </div>
  );
}
