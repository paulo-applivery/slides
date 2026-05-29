import { like } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { slideshows } from "@/lib/db/schema";
import { fetchTvSlideshowData } from "@/lib/tv/data";
import { TVApp } from "@/components/tv/TVApp";
import { TVMode } from "@/components/tv/TVMode";

/**
 * Short TV URL — `app.applivery.com/t/<prefix>`.
 *
 * A bare TV browser is hard to type long UUIDs into, so the slideshow
 * editor advertises a short link built from the first few characters of
 * the slideshow id. We resolve that prefix to the slideshow and render
 * the TV **in place** — no redirect — so the address bar stays short
 * instead of bouncing to the full `/tv/<uuid>`.
 *
 * The two entry paths mirror `/tv/[id]`:
 *   1. A signed-in editor in the owning workspace → render <TVMode>.
 *   2. An anonymous TV browser → render <TVApp> (QR / PIN pairing).
 *
 * No auth gate: same public posture as `/tv/` — the TV has no session
 * yet, and pairing still requires a signed-in user in the right
 * workspace, so resolving a prefix here leaks nothing actionable.
 */
export const dynamic = "force-dynamic";

export default async function ShortTvPage({
  params,
}: {
  params: { code: string };
}) {
  // Sanitise: UUID ids are lowercase hex + dashes. Keep only those
  // characters, lowercase, and cap the length so a junk path can't turn
  // into an expensive LIKE scan.
  const prefix = (params.code ?? "")
    .toLowerCase()
    .replace(/[^0-9a-f-]/g, "")
    .slice(0, 36);

  const match =
    prefix.length >= 4
      ? await db.query.slideshows.findFirst({
          where: like(slideshows.id, `${prefix}%`),
          columns: { id: true, workspaceId: true },
        })
      : null;

  if (!match) return <NotFound />;

  // Signed-in editor in the owning workspace → render the live TV
  // directly, skipping the QR flow (same bypass as /tv/[id]).
  const session = await auth();
  if (session?.user?.workspaceId === match.workspaceId) {
    const data = await fetchTvSlideshowData(match.workspaceId, match.id);
    if (data) {
      return (
        <TVMode
          slideshow={data.slideshow}
          dashboardsById={data.dashboardsById}
        />
      );
    }
  }

  // Anonymous TV (or a user outside the workspace) → QR / PIN pairing.
  return <TVApp slideshowId={match.id} />;
}

/** Centered notice when the prefix matches no slideshow. */
function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-canvas)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: "100%", padding: 32, textAlign: "center" }}
      >
        <h1 className="t-h3" style={{ marginBottom: 6 }}>
          Slideshow not found
        </h1>
        <p className="t-body" style={{ color: "var(--text-tertiary)" }}>
          Double-check the code shown in the slideshow editor and type it
          again, or open the slideshow from the dashboard and launch it
          directly.
        </p>
      </div>
    </main>
  );
}
