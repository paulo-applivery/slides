import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { Icons } from "@/components/ui/Icon";
import { listSlideshows } from "@/lib/slideshows";
import { canEdit, type Role } from "@/lib/roles";
import { NewSlideshowButton } from "@/components/slideshows/NewSlideshowButton";

/** Slideshows list — cards. Editors + admins see the New CTA. */
export default async function SlideshowsPage() {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const role = (session.user.role ?? null) as Role | null;
  const editable = canEdit(role);
  const items = await listSlideshows();

  return (
    <>
      <TopBar
        crumbs={[]}
        name="Slideshows"
        actions={editable ? <NewSlideshowButton /> : null}
      />
      <main className="main">
        <p
          className="t-body"
          style={{ color: "var(--text-tertiary)", margin: "0 0 24px", maxWidth: 640 }}
        >
          A slideshow rotates dashboards across an office TV. Each slide is a
          saved dashboard with a configurable display duration.
        </p>
        {items.length === 0 ? (
          <EmptyState editable={editable} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {items.map((s) => (
              <div
                key={s.id}
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <Link
                  href={`/slideshows/${s.id}/edit`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textDecoration: "none",
                  }}
                >
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
                    <Icons.Slideshow size={18} variant="bold" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-h4">{s.name}</div>
                    <div className="t-small">
                      {s.slides.length} {s.slides.length === 1 ? "slide" : "slides"} ·
                      updated {formatDistanceToNow(s.updatedAt, { addSuffix: true })}
                    </div>
                  </div>
                </Link>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: 14,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <span className="badge">
                    <span className="dot" style={{ background: "var(--text-muted)" }} />
                    Ready
                  </span>
                  <Link
                    href={`/tv/${s.id}`}
                    target="_blank"
                    className="btn btn-sm btn-ghost"
                  >
                    <Icons.TV size={12} /> Open TV
                  </Link>
                </div>
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
        No slideshows yet
      </h2>
      <p
        className="t-body"
        style={{ marginBottom: 20, color: "var(--text-tertiary)" }}
      >
        {editable
          ? "Create one to rotate dashboards on a TV in your office."
          : "An editor or admin will publish the workspace's first slideshow here."}
      </p>
      {editable && <NewSlideshowButton primary />}
    </div>
  );
}
