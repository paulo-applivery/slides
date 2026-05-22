import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { Icons } from "@/components/ui/Icon";
import { db } from "@/lib/db";
import {
  integrations,
  slideshows,
  tvSessions,
} from "@/lib/db/schema";
import { canEdit, type Role } from "@/lib/roles";
import { NewSlideshowButton } from "@/components/slideshows/NewSlideshowButton";
import { fmtInt } from "@/lib/format";

/**
 * TV mode home — the landing for the sidebar's "TV mode" link.
 *
 * Mirrors the prototype's `TVHomeScreen`: hero card with the most recent
 * slideshow + a CTA to open it on a TV, a stats row (paired TVs, last
 * sync, active slideshows), and the full slideshow grid below.
 */
export default async function TVHomePage() {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const workspaceId = session.user.workspaceId;
  const role = (session.user.role ?? null) as Role | null;
  const editable = canEdit(role);

  const [allShows, sessionRows, integrationRows] = await Promise.all([
    db
      .select({
        id: slideshows.id,
        name: slideshows.name,
        slides: slideshows.slides,
        updatedAt: slideshows.updatedAt,
      })
      .from(slideshows)
      .where(eq(slideshows.workspaceId, workspaceId))
      .orderBy(desc(slideshows.updatedAt)),
    db
      .select({ slideshowId: tvSessions.slideshowId })
      .from(tvSessions)
      .where(
        and(
          eq(tvSessions.workspaceId, workspaceId),
          isNull(tvSessions.revokedAt),
          sql`${tvSessions.expiresAt} > unixepoch()`,
        ),
      ),
    db
      .select({
        provider: integrations.provider,
        lastSyncedAt: integrations.lastSyncedAt,
        status: integrations.status,
      })
      .from(integrations)
      .where(eq(integrations.workspaceId, workspaceId)),
  ]);

  const pairedTvsCount = sessionRows.length;
  const lastSync = integrationRows
    .map((i) => i.lastSyncedAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const featured = allShows[0];

  return (
    <>
      <TopBar
        crumbs={[]}
        name="TV mode"
        actions={editable ? <NewSlideshowButton /> : null}
      />
      <main className="main">
        {featured ? (
          <FeaturedSlideshow featured={featured} editable={editable} />
        ) : (
          <EmptyFeatured editable={editable} />
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            marginTop: 16,
          }}
        >
          <StatCard
            icon={<Icons.TV size={20} variant="bold" style={{ color: "var(--primary)" }} />}
            label="Paired TVs"
            value={fmtInt(pairedTvsCount)}
            hint={
              pairedTvsCount === 0
                ? "No TVs paired yet · open a slideshow to start"
                : pairedTvsCount === 1
                  ? "1 display online"
                  : `${pairedTvsCount} displays online`
            }
          />
          <StatCard
            icon={
              <Icons.Refresh
                size={20}
                style={{
                  color:
                    integrationRows.some((i) => i.status === "error")
                      ? "var(--warning)"
                      : "var(--success)",
                }}
              />
            }
            label="Last sync"
            value={
              lastSync
                ? formatDistanceToNowStrict(lastSync, { addSuffix: false })
                : "—"
            }
            hint={
              integrationRows.length === 0
                ? "No integrations connected · go to /integrations"
                : integrationRows.some((i) => i.status === "error")
                  ? "One source has a sync error"
                  : "All sources online · auto every 5 min"
            }
          />
          <StatCard
            icon={
              <Icons.Slideshow
                size={20}
                style={{ color: "var(--warning)" }}
              />
            }
            label="Active slideshows"
            value={fmtInt(allShows.length)}
            hint={
              allShows
                .slice(0, 2)
                .map((s) => s.name)
                .join(" · ") || "Build your first below"
            }
          />
        </div>

        {allShows.length > 1 && (
          <>
            <h2
              className="t-h4"
              style={{ margin: "32px 0 12px", color: "var(--text-secondary)" }}
            >
              All slideshows
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {allShows.slice(1).map((s) => (
                <div
                  key={s.id}
                  className="card"
                  style={{
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "var(--primary-soft)",
                        color: "var(--primary)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icons.Slideshow size={14} variant="bold" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-h4" style={{ fontSize: 14 }}>
                        {s.name}
                      </div>
                      <div className="t-small">
                        {s.slides.length}{" "}
                        {s.slides.length === 1 ? "slide" : "slides"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Link
                      href={`/slideshows/${s.id}/edit`}
                      className="btn btn-sm btn-ghost"
                      style={{ flex: 1, justifyContent: "center" }}
                    >
                      <Icons.Slideshow size={12} /> Edit
                    </Link>
                    <Link
                      href={`/tv/${s.id}`}
                      target="_blank"
                      className="btn btn-sm"
                      style={{ flex: 1, justifyContent: "center" }}
                    >
                      <Icons.TV size={12} /> Open TV
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function FeaturedSlideshow({
  featured,
  editable,
}: {
  featured: {
    id: string;
    name: string;
    slides: { id: string; type: string; durationSec: number }[];
    updatedAt: Date;
  };
  editable: boolean;
}) {
  const totalSec = featured.slides.reduce((a, s) => a + s.durationSec, 0);
  const mins = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return (
    <div
      className="card card-emphasized"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 360px",
        gap: 32,
        alignItems: "center",
        padding: 24,
      }}
    >
      <div>
        <div className="t-micro" style={{ marginBottom: 10 }}>
          Office TV · {featured.name}
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          Launch your TV
        </h1>
        <p
          style={{
            color: "var(--text-tertiary)",
            maxWidth: 480,
            marginTop: 4,
            marginBottom: 24,
          }}
        >
          Push this slideshow to any screen using a 6-digit PIN or QR code.
          Once paired, the dashboard rotates and refreshes live with no
          further interaction.
        </p>
        <div className="t-small" style={{ marginBottom: 18 }}>
          {featured.slides.length} slides ·{" "}
          <span className="t-mono">
            {mins}:{String(seconds).padStart(2, "0")}
          </span>{" "}
          · updated{" "}
          {formatDistanceToNowStrict(featured.updatedAt, {
            addSuffix: true,
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href={`/tv/${featured.id}`}
            target="_blank"
            className="btn btn-primary"
          >
            <Icons.Play size={14} /> Open on TV
          </Link>
          {editable && (
            <Link
              href={`/slideshows/${featured.id}/edit`}
              className="btn"
            >
              <Icons.Slideshow size={14} /> Edit slideshow
            </Link>
          )}
        </div>
      </div>
      {/* Mini TV preview frame */}
      <div
        style={{
          aspectRatio: "16 / 10",
          background:
            "linear-gradient(180deg, var(--bg-elev-2), var(--bg-elev-3))",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(400px 200px at 80% 0%, var(--primary-tint), transparent 70%)",
          }}
          aria-hidden
        />
        <div
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span className="t-micro">Workspace</span>
            <span style={{ fontSize: 10, color: "var(--success)" }}>● LIVE</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <Tile label="MRR" value="€387K" />
            <Tile label="Target" value="77%" color="var(--warning)" />
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              justifyContent: "center",
              paddingBottom: 4,
            }}
          >
            <span
              style={{
                width: 24,
                height: 3,
                background: "var(--primary)",
                borderRadius: 2,
              }}
            />
            <span
              style={{
                width: 24,
                height: 3,
                background: "var(--bg-elev-3)",
                borderRadius: 2,
              }}
            />
            <span
              style={{
                width: 24,
                height: 3,
                background: "var(--bg-elev-3)",
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyFeatured({ editable }: { editable: boolean }) {
  return (
    <div
      className="card"
      style={{ padding: 32, textAlign: "center", maxWidth: 520, margin: "0 auto" }}
    >
      <Icons.TV size={32} style={{ color: "var(--text-muted)" }} />
      <h2 className="t-h3" style={{ marginTop: 12, marginBottom: 6 }}>
        No slideshows yet
      </h2>
      <p
        className="t-body"
        style={{ marginBottom: 20, color: "var(--text-tertiary)" }}
      >
        {editable
          ? "Create one to rotate dashboards on a TV."
          : "An editor or admin will publish the first slideshow here."}
      </p>
      {editable && <NewSlideshowButton primary />}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className="card"
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 6 }}
    >
      {icon}
      <div
        className="t-micro"
        style={{
          marginTop: 12,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        className="t-mono"
        style={{
          fontSize: 36,
          color: "var(--text-primary)",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          margin: "4px 0 8px",
        }}
      >
        {value}
      </div>
      <div className="t-small">{hint}</div>
    </div>
  );
}

function Tile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-elev-2)",
        borderRadius: 8,
        padding: 10,
      }}
    >
      <div
        className="t-micro"
        style={{ fontSize: 9 }}
      >
        {label}
      </div>
      <div
        className="t-mono"
        style={{
          color: color ?? "var(--text-primary)",
          fontSize: 22,
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}
