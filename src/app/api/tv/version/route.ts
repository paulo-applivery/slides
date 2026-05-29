/**
 * GET /api/tv/version?slideshowId=<id>[&token=<tv session>]
 *
 * Cheap change-detection probe for any TV view. Returns `{ rev }` — the max
 * `updatedAt` (epoch ms) across the slideshow and every dashboard it
 * references. The TV polls this every few seconds and only refetches the
 * heavy `/api/tv/data` payload (or reloads) when `rev` climbs, so an
 * editor's slide / dashboard change reaches every screen quickly without
 * re-running widget queries on each poll.
 *
 * Dual auth — a screen reaches this endpoint two ways:
 *   1. Anonymous paired TV: a `tv_session` token from localStorage (same
 *      model as `/api/tv/data`).
 *   2. Signed-in editor previewing on their own machine: no tv token, but a
 *      NextAuth session whose workspace owns the slideshow.
 * Either proves the caller may see this slideshow's revision.
 */
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { slideshows, tvSessions } from "@/lib/db/schema";
import { fetchTvRevision } from "@/lib/tv/data";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const slideshowId = url.searchParams.get("slideshowId");
  if (!slideshowId) {
    return NextResponse.json({ error: "Missing slideshowId" }, { status: 400 });
  }

  // Resolve the workspace allowed to read this slideshow's revision, from
  // whichever credential the caller presents.
  let workspaceId: string | null = null;

  if (token) {
    const session = await db.query.tvSessions.findFirst({
      where: and(
        eq(tvSessions.token, token),
        eq(tvSessions.slideshowId, slideshowId),
        isNull(tvSessions.revokedAt),
      ),
    });
    if (session && session.expiresAt.getTime() >= Date.now()) {
      workspaceId = session.workspaceId;
    }
  }

  if (!workspaceId) {
    // Fall back to a signed-in session (editor previewing on their machine).
    const userSession = await auth();
    const userWorkspace = userSession?.user?.workspaceId;
    if (userWorkspace) {
      const owns = await db.query.slideshows.findFirst({
        where: and(
          eq(slideshows.id, slideshowId),
          eq(slideshows.workspaceId, userWorkspace),
        ),
        columns: { id: true },
      });
      if (owns) workspaceId = userWorkspace;
    }
  }

  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rev = await fetchTvRevision(workspaceId, slideshowId);
  if (rev === null) {
    return NextResponse.json({ error: "Slideshow gone" }, { status: 404 });
  }
  return NextResponse.json({ rev });
}
