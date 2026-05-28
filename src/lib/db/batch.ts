/**
 * Cross-driver batched writes.
 *
 * The HubSpot sync upserts tens of thousands of rows. Issuing one awaited
 * statement per row is fine on local `better-sqlite3` (in-process, instant)
 * but fatal on Cloudflare D1: every statement is a subrequest, and a Worker
 * invocation is capped at ~1000 of them — so a large sync gets killed
 * mid-flight. Batching collapses N statements into one round-trip:
 *
 *   - D1 (production)      → `db.batch([...])` — one subrequest per chunk.
 *   - better-sqlite3 (dev) → a single synchronous transaction.
 *
 * Callers build (but DON'T await) the upsert statements and hand the array
 * here. Each item is a Drizzle `insert(...).onConflictDoUpdate(...)` builder.
 */
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/lib/db";

/** D1 caps practical batch size; keep chunks well under any size ceiling. */
const BATCH_CHUNK = 50;

type Upsert = BatchItem<"sqlite">;

export async function flushUpserts(statements: Upsert[]): Promise<void> {
  if (statements.length === 0) return;

  // Feature-detect the driver: only D1 exposes `.batch`.
  const maybeBatch = (db as unknown as {
    batch?: (s: [Upsert, ...Upsert[]]) => Promise<unknown>;
  }).batch;

  if (typeof maybeBatch === "function") {
    for (let i = 0; i < statements.length; i += BATCH_CHUNK) {
      const slice = statements.slice(i, i + BATCH_CHUNK);
      await maybeBatch(slice as [Upsert, ...Upsert[]]);
    }
    return;
  }

  // better-sqlite3: one synchronous transaction. The builders were created
  // from the same connection, so `.run()` enrolls them in the transaction.
  db.transaction((/* tx */) => {
    for (const s of statements) {
      (s as unknown as { run: () => void }).run();
    }
  });
}
