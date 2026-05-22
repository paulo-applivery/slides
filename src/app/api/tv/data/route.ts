/**
 * GET /api/tv/data?token=<tv session>&slideshowId=<id>
 *
 * Authenticated by the TV session token (passed from localStorage), not by
 * NextAuth. Returns the slideshow + every dashboard it references AND every
 * bound widget's pre-computed result.
 *
 * The actual fetch logic lives in `src/lib/tv/data.ts` so the page server
 * component can share it for the NextAuth bypass path.
 */
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tvSessions } from "@/lib/db/schema";
import { fetchTvSlideshowData, type TvWidgetResult } from "@/lib/tv/data";

export type { TvWidgetResult };

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

  const data = await fetchTvSlideshowData(session.workspaceId, slideshowId);
  if (!data) {
    return NextResponse.json({ error: "Slideshow gone" }, { status: 404 });
  }
  return NextResponse.json(data);
}
