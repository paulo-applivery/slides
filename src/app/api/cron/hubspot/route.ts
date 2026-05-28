/**
 * POST /api/cron/hubspot — internal cron entrypoint.
 *
 * Not reachable by end users: driven by the Cloudflare Cron Trigger via the
 * custom worker's `scheduled()` handler (see `worker.ts`), which calls this
 * route with the `x-cron-secret` header. Running the sync *inside* a normal
 * Next request means the D1 binding + dynamic `require`s resolve exactly as
 * they do in production — the scheduled handler doesn't have to bundle app
 * code or hand-populate the Cloudflare context.
 *
 * Guarded by `CRON_SECRET` (set via `wrangler secret put CRON_SECRET`). If the
 * secret is unset the route fails closed (503) so a misconfigured deploy can't
 * silently expose the processor.
 */
import { NextResponse } from "next/server";
import { processQueuedSyncs } from "@/lib/integrations/cron";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await processQueuedSyncs({ budgetMs: 25_000 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
