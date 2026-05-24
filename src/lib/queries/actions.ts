"use server";

/**
 * Server actions for the `/queries` page.
 *
 * Every mutation is scoped to the caller's workspace + role. Reads run
 * with workspace gating too — we never expose a row from another tenant.
 */
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { queries } from "@/lib/db/schema";
import { canEdit, type Role } from "@/lib/roles";
import { queryConfigSchema, type QueryConfig } from "./ast";
import { runQuery as executeQuery, type ExecutorResult } from "./executor";

/** Pull the short table-friendly summary out of a shape-aware result. */
function summarize(res: ExecutorResult): { summary: string; value: number | null } {
  switch (res.kind) {
    case "single":
      return { summary: res.formatted ?? "—", value: res.value };
    case "timeseries":
      return { summary: `${res.points.length} points`, value: null };
    case "groupby":
      return { summary: `${res.rows.length} rows`, value: null };
  }
}

class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

async function requireWorkspace() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  const role = (session?.user?.role ?? null) as Role | null;
  if (!workspaceId) throw new ForbiddenError();
  return { workspaceId, role, userId: session!.user!.id };
}

async function requireEditor() {
  const { workspaceId, role, userId } = await requireWorkspace();
  if (!canEdit(role)) throw new ForbiddenError();
  return { workspaceId, role, userId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function listQueries() {
  const { workspaceId } = await requireWorkspace();
  return db
    .select({
      id: queries.id,
      name: queries.name,
      source: queries.source,
      lastResult: queries.lastResult,
      lastRunAt: queries.lastRunAt,
      updatedAt: queries.updatedAt,
    })
    .from(queries)
    .where(eq(queries.workspaceId, workspaceId))
    .orderBy(desc(queries.updatedAt));
}

/**
 * List queries with their config exposed — used by the widget binding
 * picker, which filters down to the shapes a widget type can render.
 */
export async function listQueriesForPicker() {
  const { workspaceId } = await requireWorkspace();
  const rows = await db
    .select({
      id: queries.id,
      name: queries.name,
      source: queries.source,
      config: queries.config,
      lastResult: queries.lastResult,
      updatedAt: queries.updatedAt,
    })
    .from(queries)
    .where(eq(queries.workspaceId, workspaceId))
    .orderBy(desc(queries.updatedAt));

  // Pluck the discriminator out of the JSON for the picker filter — we don't
  // ship the full Zod runtime to the client.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    source: r.source,
    kind: ((r.config as { kind?: string } | null)?.kind ?? "single") as
      | "single"
      | "timeseries"
      | "groupby",
    summary: r.lastResult?.summary ?? null,
    updatedAt: r.updatedAt,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-shot preview run. Doesn't persist anything — used by the wizard's
 * live preview before save.
 */
export async function previewQueryAction(rawConfig: unknown) {
  const { workspaceId } = await requireWorkspace();
  const config = queryConfigSchema.parse(rawConfig);
  try {
    const res = await executeQuery(workspaceId, config);
    return { ok: true as const, ...res };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Query failed.",
    };
  }
}

/** Create a new saved query and run it once so the list shows a result. */
export async function createQueryAction(input: {
  name: string;
  config: unknown;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { workspaceId, userId } = await requireEditor();
    const config = queryConfigSchema.parse(input.config);
    const name = input.name.trim().slice(0, 120) || "Untitled query";

    const id = crypto.randomUUID();
    await db.insert(queries).values({
      id,
      workspaceId,
      name,
      source: config.source,
      config,
      createdBy: userId,
    });

    // First run (best-effort — failures are recorded but don't block save).
    try {
      const res = await executeQuery(workspaceId, config);
      const { summary, value } = summarize(res);
      await db
        .update(queries)
        .set({
          lastResult: {
            ranAt: Date.now(),
            ms: res.ms,
            summary,
            value,
          },
          lastRunAt: new Date(),
        })
        .where(eq(queries.id, id));
    } catch (err) {
      await db
        .update(queries)
        .set({
          lastResult: {
            ranAt: Date.now(),
            ms: 0,
            summary: null,
            value: null,
            error: err instanceof Error ? err.message : String(err),
          },
          lastRunAt: new Date(),
        })
        .where(eq(queries.id, id));
    }

    revalidatePath("/queries");
    return { ok: true, id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save.",
    };
  }
}

export async function deleteQueryAction(id: string): Promise<void> {
  const { workspaceId } = await requireEditor();
  await db
    .delete(queries)
    .where(and(eq(queries.id, id), eq(queries.workspaceId, workspaceId)));
  revalidatePath("/queries");
}

/**
 * Load a single query's name + config so the edit page can pre-fill the
 * wizard. Workspace-gated; returns `null` for cross-tenant or missing ids.
 */
export async function getQueryForEdit(id: string): Promise<
  | { id: string; name: string; source: "stripe" | "hubspot"; config: QueryConfig }
  | null
> {
  const { workspaceId } = await requireWorkspace();
  const row = await db.query.queries.findFirst({
    where: and(eq(queries.id, id), eq(queries.workspaceId, workspaceId)),
    columns: { id: true, name: true, source: true, config: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    source: row.source as "stripe" | "hubspot",
    config: row.config as QueryConfig,
  };
}

/**
 * Update an existing saved query. Same shape as create — validates the
 * config against the Zod schema, re-runs once after save so the list's
 * `lastResult` summary stays fresh.
 */
export async function updateQueryAction(input: {
  id: string;
  name: string;
  config: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { workspaceId } = await requireEditor();
    const config = queryConfigSchema.parse(input.config);
    const name = input.name.trim().slice(0, 120) || "Untitled query";

    // Verify the query belongs to this workspace before mutating.
    const existing = await db.query.queries.findFirst({
      where: and(eq(queries.id, input.id), eq(queries.workspaceId, workspaceId)),
      columns: { id: true },
    });
    if (!existing) return { ok: false, error: "Query not found." };

    await db
      .update(queries)
      .set({
        name,
        source: config.source,
        config,
        updatedAt: new Date(),
      })
      .where(eq(queries.id, input.id));

    // Re-run after save so the row's last-result strip reflects the
    // change. Errors are recorded but don't roll back the update — a
    // user editing a query expects their edit to land even if the
    // re-execution fails.
    try {
      const res = await executeQuery(workspaceId, config);
      const { summary, value } = summarize(res);
      await db
        .update(queries)
        .set({
          lastResult: { ranAt: Date.now(), ms: res.ms, summary, value },
          lastRunAt: new Date(),
        })
        .where(eq(queries.id, input.id));
    } catch (err) {
      await db
        .update(queries)
        .set({
          lastResult: {
            ranAt: Date.now(),
            ms: 0,
            summary: null,
            value: null,
            error: err instanceof Error ? err.message : String(err),
          },
          lastRunAt: new Date(),
        })
        .where(eq(queries.id, input.id));
    }

    revalidatePath("/queries");
    revalidatePath("/dashboards");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save.",
    };
  }
}

/**
 * Duplicate a saved query — copies name (suffixed " (copy)") + config,
 * leaves last-run data fresh. Returns the new id so the caller can
 * redirect to its edit page.
 */
export async function duplicateQueryAction(
  id: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { workspaceId, userId } = await requireEditor();
    const src = await db.query.queries.findFirst({
      where: and(eq(queries.id, id), eq(queries.workspaceId, workspaceId)),
    });
    if (!src) return { ok: false, error: "Query not found." };

    const newId = crypto.randomUUID();
    const newName = `${src.name} (copy)`.slice(0, 120);
    await db.insert(queries).values({
      id: newId,
      workspaceId,
      name: newName,
      source: src.source,
      config: src.config,
      createdBy: userId,
    });
    revalidatePath("/queries");
    return { ok: true, id: newId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to duplicate.",
    };
  }
}

export async function runQueryAction(id: string): Promise<void> {
  const { workspaceId } = await requireWorkspace();
  const row = await db.query.queries.findFirst({
    where: and(eq(queries.id, id), eq(queries.workspaceId, workspaceId)),
  });
  if (!row) throw new Error("Query not found.");
  try {
    const res = await executeQuery(workspaceId, row.config as QueryConfig);
    const { summary, value } = summarize(res);
    await db
      .update(queries)
      .set({
        lastResult: {
          ranAt: Date.now(),
          ms: res.ms,
          summary,
          value,
        },
        lastRunAt: new Date(),
      })
      .where(eq(queries.id, id));
  } catch (err) {
    await db
      .update(queries)
      .set({
        lastResult: {
          ranAt: Date.now(),
          ms: 0,
          summary: null,
          value: null,
          error: err instanceof Error ? err.message : String(err),
        },
        lastRunAt: new Date(),
      })
      .where(eq(queries.id, id));
  }
  revalidatePath("/queries");
}
