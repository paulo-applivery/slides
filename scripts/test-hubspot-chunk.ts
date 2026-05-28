/**
 * Manual verification for the resumable HubSpot sync. Enqueues an INCREMENTAL
 * sync (no mirror wipe) for the connected workspace, then drives
 * `runHubspotSyncChunk` in a loop with a tiny budget so we exercise the
 * resume-across-invocations path against the live API + local dev.db.
 *
 * Run: pnpm tsx scripts/test-hubspot-chunk.ts
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  enqueueHubspotSync,
  getHubspotSyncProgress,
  runHubspotSyncChunk,
} from "@/lib/integrations/hubspot";

async function main() {
  const row = await db.query.integrations.findFirst({
    where: eq(integrations.provider, "hubspot"),
  });
  if (!row) throw new Error("No HubSpot integration in dev.db");
  const ws = row.workspaceId;
  console.log("workspace:", ws.slice(0, 8), "lastSyncedAt:", row.lastSyncedAt);

  await enqueueHubspotSync(ws); // incremental — does NOT wipe the mirror
  console.log("queued:", JSON.stringify(await getHubspotSyncProgress(ws)));

  let done = false;
  let tick = 0;
  while (!done && tick < 50) {
    tick++;
    const r = await runHubspotSyncChunk(ws, { budgetMs: 3000 });
    done = r.done;
    const p = await getHubspotSyncProgress(ws);
    console.log(
      `tick ${tick}: done=${done} phase=${r.state.phase} cursorMs=${r.state.cursorMs} ` +
        `deals=${p?.processedDeals} contacts=${p?.processedContacts} status=${p?.syncStatus}`,
    );
  }

  const final = await getHubspotSyncProgress(ws);
  console.log("FINAL:", JSON.stringify(final, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  });
