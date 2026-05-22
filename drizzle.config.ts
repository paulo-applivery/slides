import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit — SQLite dialect.
 *
 * Local dev runs against a file (`dev.db`) via `better-sqlite3`. The same
 * schema deploys to Cloudflare D1 — Drizzle Kit's `dialect: "sqlite"` emits
 * SQL D1 understands directly.
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, ""),
  },
  strict: true,
  verbose: true,
});
