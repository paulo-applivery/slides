/**
 * GET /api/tv/version?token=<tv session>&slideshowId=<id>
 *
 * Cheap change-detection probe for paired TVs. Returns `{ rev }` — the max
 * `updatedAt` (epoch ms) across the slideshow and every dashboard it
 * references. The TV polls this every few seconds and only refetches the
 * heavy `/api/tv/data` payload when `rev` climbs, so an editor's slide /
 * dashboard change reaches every screen quickly without re-running widget
 * queries on each poll.
 *
 * Same auth model as `/api/tv/data`: the TV session token from
 * localStorage, not a NextAuth session.
 */
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tvSessions } from "@/lib/db/schema";
import { fetchTvRevision } from "@/lib/tv/data";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const slideshowId = url.searchParams.get("slideshowId");
  if (!token || !slideshowId) {
    return NextResponse.json(
      { error: "Missing token / slideshowId" },
      { status: 400 },
    );
  }

  const session = await db.query.tvSessions.findFirst({
    where: and(
      eq(tvSessions.token, token),
      eq(tvSessions.slideshowId, slideshowId),
      isNull(tvSessions.revokedAt),
    ),
  });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const rev = await fetchTvRevision(session.workspaceId, slideshowId);
  if (rev === null) {
    return NextResponse.json({ error: "Slideshow gone" }, { status: 404 });
  }
  return NextResponse.json({ rev });
}
