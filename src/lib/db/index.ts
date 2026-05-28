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
import { getCloudflareContext } from "@opennextjs/cloudflare";
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
}

function makeDb(): AppDb {
  // Production on Cloudflare: the D1 binding lives on the request context's
  // `env`, exposed by @opennextjs/cloudflare — NOT on globalThis. Calling
  // getCloudflareContext() outside the Worker (local `next build`, tsx
  // scripts) throws, so we catch and fall through to local SQLite.
  try {
    const env = getCloudflareContext().env as { DB?: unknown };
    if (env?.DB) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { drizzle } = require("drizzle-orm/d1");
      return drizzle(env.DB, { schema }) as unknown as AppDb;
    }
  } catch {
    // Not running inside the Cloudflare Worker — use the local driver below.
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

let cached: AppDb | undefined = globalThis.__slidesDb;

function resolveDb(): AppDb {
  if (!cached) {
    cached = makeDb();
    if (process.env.NODE_ENV !== "production") globalThis.__slidesDb = cached;
  }
  return cached;
}

/**
 * Lazy proxy. Resolving the D1 binding eagerly at module-eval time can run
 * before any request context exists; deferring to first property access
 * guarantees we're inside a request where getCloudflareContext() works.
 */
export const db: AppDb = new Proxy({} as AppDb, {
  get(_target, prop, receiver) {
    const real = resolveDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});

export { schema };
export type Db = typeof db;
