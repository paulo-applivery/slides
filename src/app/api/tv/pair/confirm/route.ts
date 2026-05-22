/**
 * POST /api/tv/pair/confirm
 *
 * Body: `{ token }`. Session-required: called by the mobile `/pair` page
 * after the user taps "Pair this TV".
 *
 * Side effects (atomic-ish — two updates inside a try/catch):
 *   1) Validate the pairing token (exists, unused, not expired).
 *   2) Validate the slideshow belongs to the caller's workspace.
 *   3) Insert a new `tv_sessions` row (30-day TTL, scoped to slideshow + workspace).
 *   4) Mark the pairing token used + populate `tvSessionId`.
 *
 * The TV will pick up the new session on its next `/api/tv/pair/poll` tick.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  pairingTokens,
  slideshows,
  tvSessions,
} from "@/lib/db/schema";
import { newSessionToken, sessionExpiresAt } from "@/lib/tv/pairing";

const bodySchema = z.object({ token: z.string().min(1) });

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  const workspaceId = session?.user?.workspaceId;
  if (!userId || !workspaceId) {
    return NextResponse.json({ error: "Sign in to pair." }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const pair = await db.query.pairingTokens.findFirst({
    where: eq(pairingTokens.token, parsed.token),
  });
  if (!pair) {
    return NextResponse.json(
      { error: "Pairing token not found." },
      { status: 404 },
    );
  }
  if (pair.usedAt) {
    return NextResponse.json(
      { error: "Already paired from another device." },
      { status: 410 },
    );
  }
  if (pair.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "Pairing token expired — reload the TV." },
      { status: 410 },
    );
  }

  // Verify the slideshow belongs to this user's workspace.
  const ss = await db.query.slideshows.findFirst({
    where: and(
      eq(slideshows.id, pair.slideshowId),
      eq(slideshows.workspaceId, workspaceId),
    ),
    columns: { id: true, name: true },
  });
  if (!ss) {
    return NextResponse.json(
      { error: "This slideshow isn't in your workspace." },
      { status: 403 },
    );
  }

  // Mint the long-lived TV session.
  const tvSessionId = crypto.randomUUID();
  const sessionToken = newSessionToken();
  await db.insert(tvSessions).values({
    id: tvSessionId,
    slideshowId: pair.slideshowId,
    workspaceId,
    token: sessionToken,
    pairedByUserId: userId,
    expiresAt: sessionExpiresAt(),
  });
  await db
    .update(pairingTokens)
    .set({
      usedAt: new Date(),
      usedByUserId: userId,
      tvSessionId,
    })
    .where(eq(pairingTokens.id, pair.id));

  return NextResponse.json({ ok: true, slideshow: ss });
}
