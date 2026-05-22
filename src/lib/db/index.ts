/**
 * Database client.
 *
 * Local dev / `pnpm dev`     → `better-sqlite3` against a file (default `./dev.db`).
 * Cloudflare deploy          → `drizzle-orm/d1` against the D1 binding declared
 *                              in `wrangler.toml`. The factory below detects
 *                              the binding via `globalThis.DB` and swaps
 *                              drivers — same Drizzle interface either way.
 *
 * The schema is SQLite-flavor, so both drivers run the same SQL.
 *
 * In dev the client is cached on `globalThis` so HMR reloads don't leak
 * file handles.
 */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/**
 * Both `drizzle-orm/better-sqlite3` and `drizzle-orm/d1` expose the same
 * relational + builder API — `.select()`, `.insert()`, `.returning()`,
 * `.query.*`, etc. We type `db` as the better-sqlite3 flavor so callers
 * get full IDE inference; the D1 branch returns the same shape at runtime
 * and is cast through.
 */
type AppDb = BetterSQLite3Database<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __slidesDb: AppDb | undefined;
  // Cloudflare D1 binding declared in wrangler.toml. The runtime injects
  // it on `globalThis` when deployed. Typed `unknown` because we don't
  // pull in `@cloudflare/workers-types` in the Node bundle.
  // eslint-disable-next-line no-var
  var DB: unknown;
}

function makeDb(): AppDb {
  // Production on Cloudflare: a D1 binding is injected as globalThis.DB.
  if (typeof globalThis.DB !== "undefined") {
    // dynamic import keeps this branch out of the Node bundle
    // (and avoids dragging the SQLite native binary onto the edge runtime).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/d1");
    return drizzle(globalThis.DB, { schema }) as unknown as AppDb;
  }

  // Local Node dev / build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const path = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db: AppDb = globalThis.__slidesDb ?? makeDb();
if (process.env.NODE_ENV !== "production") globalThis.__slidesDb = db;

export { schema };
export type Db = typeof db;
