/**
 * Cron processor for background integration syncs.
 *
 * Invoked once per Cloudflare Cron tick (via the internal `/api/cron/hubspot`
 * route — see `worker.ts`). Picks up every HubSpot integration that's `queued`
 * or still `running` and advances it by one bounded chunk. A large portal is
 * pulled across many ticks: each `runHubspotSyncChunk` call persists its cursor
 * and returns, so the next tick resumes where it left off — staying clear of a
 * Worker invocation's subrequest + wall-clock ceilings.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { runHubspotSyncChunk } from "@/lib/integrations/hubspot";

export async function processQueuedSyncs(
  opts: { budgetMs?: number } = {},
): Promise<{ processed: number; pending: number }> {
  const rows = await db
    .select({ workspaceId: integrations.workspaceId })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "hubspot"),
        inArray(integrations.syncStatus, ["queued", "running"]),
      ),
    );

  let processed = 0;
  let pending = 0;
  for (const row of rows) {
    try {
      const { done } = await runHubspotSyncChunk(row.workspaceId, {
        budgetMs: opts.budgetMs,
      });
      processed++;
      if (!done) pending++;
    } catch (err) {
      // `runHubspotSyncChunk` already recorded the failure on the row
      // (`syncStatus='error'`, `lastError`). Log and move on so one bad
      // integration doesn't starve the others on this tick.
      console.error(
        "[cron] hubspot chunk failed for workspace",
        row.workspaceId.slice(0, 8),
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { processed, pending };
}
