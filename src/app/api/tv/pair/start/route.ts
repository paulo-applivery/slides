/**
 * POST /api/tv/pair/start
 *
 * Body: `{ slideshowId }`. Public — anyone can mint a pairing token for any
 * slideshow id; the real authorization happens when a signed-in user
 * confirms the pairing on /pair, since they can only confirm slideshows
 * inside their own workspace.
 *
 * Returns `{ token, pin, qrDataUrl, expiresAt }`.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { pairingTokens, slideshows } from "@/lib/db/schema";
import {
  newPairingToken,
  newPin,
  pairingExpiresAt,
  pairingUrl,
  qrDataUrl,
} from "@/lib/tv/pairing";

const bodySchema = z.object({ slideshowId: z.string().min(1) });

export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Confirm the slideshow exists — without leaking workspace data.
  const ss = await db.query.slideshows.findFirst({
    where: eq(slideshows.id, parsed.slideshowId),
    columns: { id: true },
  });
  if (!ss) {
    return NextResponse.json({ error: "Slideshow not found" }, { status: 404 });
  }

  const token = newPairingToken();
  const pin = newPin();
  const expiresAt = pairingExpiresAt();

  await db.insert(pairingTokens).values({
    slideshowId: parsed.slideshowId,
    token,
    pin,
    expiresAt,
  });

  const origin = new URL(req.url).origin;
  const url = pairingUrl(origin, token);
  const qr = await qrDataUrl(url);

  return NextResponse.json({
    token,
    pin,
    qrDataUrl: qr,
    expiresAt: expiresAt.toISOString(),
  });
}
