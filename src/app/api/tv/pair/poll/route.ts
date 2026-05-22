/**
 * GET /api/tv/pair/poll?token=<pairing token>
 *
 * Returns `{ status: 'pending' | 'paired' | 'expired', sessionToken? }`.
 *
 * Public — the token is the secret. Polled every ~2s by /tv/[id] while
 * unpaired.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pairingTokens, tvSessions } from "@/lib/db/schema";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const row = await db.query.pairingTokens.findFirst({
    where: eq(pairingTokens.token, token),
  });
  if (!row) {
    return NextResponse.json({ status: "expired" });
  }
  if (row.expiresAt.getTime() < Date.now() && !row.usedAt) {
    return NextResponse.json({ status: "expired" });
  }
  if (!row.usedAt || !row.tvSessionId) {
    return NextResponse.json({ status: "pending" });
  }

  // Confirmed → return the matching tv_session token to the TV. After this
  // moment the TV writes the session token to localStorage and reloads.
  const session = await db.query.tvSessions.findFirst({
    where: eq(tvSessions.id, row.tvSessionId),
  });
  if (!session) {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({
    status: "paired",
    sessionToken: session.token,
  });
}
