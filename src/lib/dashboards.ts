/**
 * Dashboard data access + mutations. Server-only; every operation is scoped
 * to the workspace pulled from the session and rejects on a role mismatch.
 *
 * The mutations are exported as Next.js server actions ("use server" at the
 * top), so client components can call them directly via `<form action>` or
 * imperative calls without an explicit API route.
 */
"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";
import { canEdit, type Role } from "@/lib/roles";
import type { DashboardTheme } from "@/lib/appearance";

class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

async function requireEditor() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  const role = (session?.user?.role ?? null) as Role | null;
  if (!workspaceId) throw new ForbiddenError();
  if (!canEdit(role)) throw new ForbiddenError();
  return { workspaceId, role: role!, userId: session!.user!.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export type DashboardListItem = {
  id: string;
  name: string;
  widgetCount: number;
  updatedAt: Date;
};

export async function listDashboards(
  workspaceId: string,
): Promise<DashboardListItem[]> {
  const rows = await db
    .select({
      id: dashboards.id,
      name: dashboards.name,
      layout: dashboards.layout,
      updatedAt: dashboards.updatedAt,
    })
    .from(dashboards)
    .where(and(eq(dashboards.workspaceId, workspaceId), eq(dashboards.archived, false)))
    .orderBy(desc(dashboards.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    widgetCount: r.layout?.widgets?.length ?? 0,
    updatedAt: r.updatedAt,
  }));
}

export async function getDashboard(workspaceId: string, id: string) {
  return db.query.dashboards.findFirst({
    where: and(eq(dashboards.id, id), eq(dashboards.workspaceId, workspaceId)),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations (server actions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new (empty-layout) dashboard, then redirect to its detail page.
 * The redirect happens server-side so the client sees a fresh URL on response.
 */
export async function createDashboard(name?: string): Promise<void> {
  const { workspaceId, userId } = await requireEditor();
  const finalName = (name?.trim() || "Untitled dashboard").slice(0, 120);

  const id = crypto.randomUUID();
  await db.insert(dashboards).values({
    id,
    workspaceId,
    name: finalName,
    createdBy: userId,
    layout: { widgets: [] },
  });

  revalidatePath("/dashboards");
  redirect(`/dashboards/${id}`);
}

/** Rename a dashboard; trims + length-caps server-side. */
export async function renameDashboard(id: string, name: string): Promise<void> {
  const { workspaceId } = await requireEditor();
  const finalName = name.trim().slice(0, 120);
  if (!finalName) return;

  await db
    .update(dashboards)
    .set({ name: finalName, updatedAt: new Date() })
    .where(and(eq(dashboards.id, id), eq(dashboards.workspaceId, workspaceId)));

  revalidatePath("/dashboards");
  revalidatePath(`/dashboards/${id}`);
}

/** Set a dashboard's light/dark theme. Applied in-app and on TV. */
export async function setDashboardTheme(
  id: string,
  theme: DashboardTheme,
): Promise<void> {
  const { workspaceId } = await requireEditor();
  await db
    .update(dashboards)
    .set({ theme, updatedAt: new Date() })
    .where(and(eq(dashboards.id, id), eq(dashboards.workspaceId, workspaceId)));
  revalidatePath(`/dashboards/${id}`);
}

/**
 * Duplicate a dashboard — copies name (suffixed " (copy)") + the full
 * widget layout verbatim. Widget ids only need to be unique within a
 * dashboard, so cloning them into a fresh dashboard is safe. Returns the
 * new id so the caller can navigate to it.
 */
export async function duplicateDashboard(
  id: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { workspaceId, userId } = await requireEditor();
    const src = await db.query.dashboards.findFirst({
      where: and(eq(dashboards.id, id), eq(dashboards.workspaceId, workspaceId)),
    });
    if (!src) return { ok: false, error: "Dashboard not found." };

    const newId = crypto.randomUUID();
    await db.insert(dashboards).values({
      id: newId,
      workspaceId,
      name: `${src.name} (copy)`.slice(0, 120),
      createdBy: userId,
      layout: src.layout ?? { widgets: [] },
      theme: src.theme,
    });
    revalidatePath("/dashboards");
    return { ok: true, id: newId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to duplicate.",
    };
  }
}

/** Soft-archive a dashboard; we never hard-delete. */
export async function archiveDashboard(id: string): Promise<void> {
  const { workspaceId } = await requireEditor();
  await db
    .update(dashboards)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(dashboards.id, id), eq(dashboards.workspaceId, workspaceId)));
  revalidatePath("/dashboards");
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout mutations (Phase 3 slice 1)
// ─────────────────────────────────────────────────────────────────────────────

type WidgetType = "gauge" | "bar" | "funnel" | "ranking" | "singleValue";

/** Read-modify-write helper so all layout mutations stay consistent. */
async function mutateLayout(
  dashboardId: string,
  workspaceId: string,
  fn: (current: { widgets: Array<{ id: string; type: WidgetType; queryId: string | null; pos: { x: number; y: number; w: number; h: number }; display?: Record<string, unknown> }> }) => {
    widgets: Array<{ id: string; type: WidgetType; queryId: string | null; pos: { x: number; y: number; w: number; h: number }; display?: Record<string, unknown> }>;
  },
) {
  const row = await db.query.dashboards.findFirst({
    where: and(eq(dashboards.id, dashboardId), eq(dashboards.workspaceId, workspaceId)),
    columns: { id: true, layout: true },
  });
  if (!row) throw new Error("Dashboard not found.");
  const next = fn(row.layout ?? { widgets: [] });
  await db
    .update(dashboards)
    .set({ layout: next, updatedAt: new Date() })
    .where(eq(dashboards.id, dashboardId));
  revalidatePath(`/dashboards/${dashboardId}`);
}

/** Default grid spans per widget type — used until react-grid-layout lands. */
const DEFAULT_SPANS: Record<WidgetType, { w: number; h: number }> = {
  singleValue: { w: 3, h: 1 },
  gauge: { w: 5, h: 2 },
  bar: { w: 7, h: 2 },
  funnel: { w: 7, h: 2 },
  ranking: { w: 5, h: 2 },
};

/** Append a new (unbound) widget to a dashboard's layout. */
export async function addWidget(
  dashboardId: string,
  type: WidgetType,
): Promise<{ id: string }> {
  const { workspaceId } = await requireEditor();
  const widgetId = crypto.randomUUID();
  await mutateLayout(dashboardId, workspaceId, (current) => {
    const span = DEFAULT_SPANS[type];
    const nextY = current.widgets.reduce(
      (max, w) => Math.max(max, w.pos.y + w.pos.h),
      0,
    );
    return {
      widgets: [
        ...current.widgets,
        {
          id: widgetId,
          type,
          queryId: null,
          pos: { x: 0, y: nextY, w: span.w, h: span.h },
        },
      ],
    };
  });
  return { id: widgetId };
}

/** Remove a widget by id. */
export async function removeWidget(
  dashboardId: string,
  widgetId: string,
): Promise<void> {
  const { workspaceId } = await requireEditor();
  await mutateLayout(dashboardId, workspaceId, (current) => ({
    widgets: current.widgets.filter((w) => w.id !== widgetId),
  }));
}

/**
 * Duplicate a widget on the same dashboard.
 *
 * Clones the entire widget shape — type, query binding, display blob
 * (title / filters / stages / time period / chip / etc.) — gives it a
 * fresh UUID, and places it directly below the source so the operator
 * can see it without scrolling. Funnel stage ids are also re-minted
 * so React keys don't collide between the original and the clone.
 *
 * Returns the new widget's id so the caller could focus it / open the
 * editor on it if needed.
 */
export async function duplicateWidget(
  dashboardId: string,
  widgetId: string,
): Promise<{ id: string } | null> {
  const { workspaceId } = await requireEditor();
  const newId = crypto.randomUUID();
  let didDuplicate = false;
  await mutateLayout(dashboardId, workspaceId, (current) => {
    const src = current.widgets.find((w) => w.id === widgetId);
    if (!src) return current;
    didDuplicate = true;

    // Re-mint funnel stage ids so the clone's stages don't share
    // React keys with the original's stages. Other display fields
    // are safe to copy verbatim — they don't reference widget id.
    const display = src.display
      ? structuredClone(src.display)
      : undefined;
    if (display && Array.isArray((display as { stages?: unknown }).stages)) {
      const stages = (display as { stages: Array<{ id: string }> }).stages;
      stages.forEach((s) => {
        s.id = crypto.randomUUID();
      });
    }

    // Drop the clone directly under the source — same x + width, one
    // row below the source's bottom edge. Other widgets sitting in
    // that space don't get pushed down (we'd need a full reflow for
    // that); they overlap until the operator drags the clone
    // somewhere. Same UX as Plecto/Looker — explicit > magical.
    const dropY = src.pos.y + src.pos.h;

    return {
      widgets: [
        ...current.widgets,
        {
          id: newId,
          type: src.type,
          queryId: src.queryId ?? null,
          pos: { x: src.pos.x, y: dropY, w: src.pos.w, h: src.pos.h },
          display,
        },
      ],
    };
  });
  return didDuplicate ? { id: newId } : null;
}

/** Bind (or unbind, pass `null`) a widget to a saved query. */
export async function bindWidget(
  dashboardId: string,
  widgetId: string,
  queryId: string | null,
): Promise<void> {
  const { workspaceId } = await requireEditor();
  await mutateLayout(dashboardId, workspaceId, (current) => ({
    widgets: current.widgets.map((w) =>
      w.id === widgetId ? { ...w, queryId } : w,
    ),
  }));
}

/**
 * Patch a widget's `display` metadata — title, titleSize, and chip today;
 * extensible for future operator-editable bits (period label, unit override,
 * gauge target, etc.).
 *
 * Pass `null` for a field to clear it (e.g. `titleSize: null` reverts
 * the title to the auto cqh-driven size; `chip: null` removes the chip
 * entirely).
 */
export async function updateWidgetDisplay(
  dashboardId: string,
  widgetId: string,
  patch: {
    title?: string | null;
    titleSize?: number | null;
    /**
     * Chart text-size multiplier (applied to value labels, axis ticks,
     * legends). `null` reverts to the 1× default.
     */
    textScale?: number | null;
    /** "left" | "center" | "right". `null` reverts to the CSS default. */
    titleAlign?: "left" | "center" | "right" | null;
    chip?: {
      icon?: string | null;
      color?: string | null;
      text?: string | null;
      size?: number | null;
    } | null;
    /** Persist the full TimePeriod object as-is; `null` clears the override. */
    timePeriod?: unknown | null;
    /** Gauge target. `null` clears, falls back to the SEED default. */
    target?: number | null;
    /**
     * Funnel-only: ordered list of stages, each backed by its own
     * (optional) saved query. We replace the whole list on every patch
     * — it's small (typically 3–6 entries) and reorder/insert/delete
     * are all expressed as a new list anyway. `null` clears the list
     * entirely (widget falls back to SEED).
     */
    stages?:
      | Array<{
          id: string;
          label: string;
          queryId: string | null;
          /** Optional override of the stage query's saved dateField. */
          dateField?: string;
          /**
           * Optional per-stage time-window override. Wins over the
           * widget-level `display.timePeriod` for this stage only.
           * Persisted as the same shape the TimePeriodPicker emits.
           */
          timePeriod?: unknown;
          /** Optional per-stage color override (hex). */
          color?: string;
        }>
      | null;
    /**
     * Widget-level extra filters. AND'd with the bound query's own
     * filters at execute time. Same shape as QueryConfig.filters.
     * `null` clears the overlay. Replaces the whole array on every
     * patch — like `stages`, it's small and reorder/delete are all
     * just "save the new list".
     *
     * Legacy shape — applies to every query regardless of object.
     * New saves prefer `filtersByObject` below.
     */
    filters?: import("@/lib/queries/ast").Filter[] | null;
    /**
     * Per-object filter overlays, keyed by SourceObject (deals /
     * contacts / charges). Replaces the whole object on every
     * patch. `null` clears all per-object filters; an empty
     * object is treated the same. Individual object keys with `[]`
     * or missing are treated as "no filters for that object".
     */
    filtersByObject?: Partial<
      Record<
        import("@/lib/queries/catalog").SourceObject,
        import("@/lib/queries/ast").Filter[]
      >
    > | null;
  },
): Promise<void> {
  const { workspaceId } = await requireEditor();
  await mutateLayout(dashboardId, workspaceId, (current) => ({
    widgets: current.widgets.map((w) => {
      if (w.id !== widgetId) return w;
      const nextDisplay: Record<string, unknown> = { ...(w.display ?? {}) };
      if (patch.timePeriod !== undefined) {
        if (patch.timePeriod === null) delete nextDisplay.timePeriod;
        else nextDisplay.timePeriod = patch.timePeriod;
      }
      if (patch.target !== undefined) {
        if (patch.target === null || !Number.isFinite(patch.target)) {
          delete nextDisplay.target;
        } else {
          // Negative gauge targets aren't meaningful; clamp at 0.
          nextDisplay.target = Math.max(0, patch.target);
        }
      }
      if (patch.filters !== undefined) {
        // Empty array == "no filters" → drop the key so the saved
        // display blob stays minimal. `null` does the same.
        if (
          patch.filters === null ||
          (Array.isArray(patch.filters) && patch.filters.length === 0)
        ) {
          delete nextDisplay.filters;
        } else {
          // Trust the caller's shape — the EditWidgetDialog uses the
          // same Filter editor as the wizard so the values are
          // already validated. We don't run the Zod schema here to
          // avoid pulling the AST into this server action.
          nextDisplay.filters = patch.filters;
        }
      }
      if (patch.filtersByObject !== undefined) {
        if (
          patch.filtersByObject === null ||
          Object.keys(patch.filtersByObject).length === 0
        ) {
          delete nextDisplay.filtersByObject;
        } else {
          // Drop empty arrays so the persisted shape stays minimal —
          // `{ deals: [], contacts: [...] }` becomes `{ contacts:
          // [...] }`. If everything ends up empty, drop the whole
          // key.
          const compact: Record<string, unknown> = {};
          for (const [obj, list] of Object.entries(patch.filtersByObject)) {
            if (Array.isArray(list) && list.length > 0) {
              compact[obj] = list;
            }
          }
          if (Object.keys(compact).length === 0) {
            delete nextDisplay.filtersByObject;
          } else {
            nextDisplay.filtersByObject = compact;
          }
        }
      }
      if (patch.stages !== undefined) {
        if (patch.stages === null || patch.stages.length === 0) {
          delete nextDisplay.stages;
        } else {
          // Sanitise: clamp label length, force `id` to a string, and
          // coerce empty/whitespace queryIds to null so the renderer
          // can treat unbound stages uniformly. Cap at 12 stages —
          // beyond that a funnel chart loses readability anyway.
          nextDisplay.stages = patch.stages.slice(0, 12).map((s) => {
            const out: {
              id: string;
              label: string;
              queryId: string | null;
              dateField?: string;
              timePeriod?: unknown;
              color?: string;
            } = {
              id: String(s.id || crypto.randomUUID()),
              label: String(s.label ?? "").trim().slice(0, 40) || "Stage",
              queryId:
                typeof s.queryId === "string" && s.queryId.trim()
                  ? s.queryId
                  : null,
            };
            // Per-stage dateField override — only persist when the
            // operator picked something. Empty string means "use the
            // query's saved dateField" → drop the key so the saved
            // blob stays small.
            if (
              typeof s.dateField === "string" &&
              s.dateField.trim().length > 0
            ) {
              out.dateField = s.dateField.trim();
            }
            // Per-stage timePeriod override. Trust the caller's
            // shape — TimePeriodPicker emits validated values and
            // the executor's `resolveTimePeriod` already handles
            // unknown discriminants defensively.
            if (
              s.timePeriod &&
              typeof s.timePeriod === "object"
            ) {
              out.timePeriod = s.timePeriod;
            }
            // Per-stage color — only persist a valid 3/6-digit hex.
            // Anything else (empty, "auto") drops the key so the
            // funnel falls back to the brand gradient.
            if (
              typeof s.color === "string" &&
              /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.color.trim())
            ) {
              out.color = s.color.trim();
            }
            return out;
          });
        }
      }
      if (patch.title !== undefined) {
        const t = patch.title?.toString().trim().slice(0, 80) ?? "";
        if (!t) delete nextDisplay.title;
        else nextDisplay.title = t;
      }
      if (patch.titleSize !== undefined) {
        if (patch.titleSize === null) delete nextDisplay.titleSize;
        else {
          // Clamp to sane bounds — too small is unreadable from a TV, too
          // big crashes into chart content. The cqh default sizes between
          // 20–64 px; we let operators override to anything 12–96 px.
          nextDisplay.titleSize = Math.max(12, Math.min(96, Math.round(patch.titleSize)));
        }
      }
      if (patch.textScale !== undefined) {
        // `null`, a non-finite value, or the 1× default all clear the
        // key so the saved blob stays minimal and CSS falls back to
        // `var(--chart-text-scale, 1)`. Otherwise clamp to a readable
        // band — below ~0.5× text is illegible, above ~2× it crashes
        // into chart geometry.
        if (
          patch.textScale === null ||
          !Number.isFinite(patch.textScale) ||
          patch.textScale === 1
        ) {
          delete nextDisplay.textScale;
        } else {
          const clamped = Math.max(0.5, Math.min(2, patch.textScale));
          // Round to 2 decimals so presets persist cleanly (0.85, 1.2…).
          nextDisplay.textScale = Math.round(clamped * 100) / 100;
        }
      }
      if (patch.titleAlign !== undefined) {
        if (patch.titleAlign === null) delete nextDisplay.titleAlign;
        else if (
          patch.titleAlign === "left" ||
          patch.titleAlign === "center" ||
          patch.titleAlign === "right"
        ) {
          nextDisplay.titleAlign = patch.titleAlign;
        }
      }
      if (patch.chip !== undefined) {
        if (patch.chip === null) {
          delete nextDisplay.chip;
        } else {
          const cur = (nextDisplay.chip as Record<string, unknown> | undefined) ?? {};
          const text =
            patch.chip.text === undefined
              ? cur.text
              : patch.chip.text === null
                ? ""
                : patch.chip.text.trim().slice(0, 32);
          // Empty text → drop the chip entirely. A chip without a label
          // is just decoration that confuses operators trying to read it.
          if (!text || typeof text !== "string") {
            delete nextDisplay.chip;
          } else {
            const next: Record<string, unknown> = { ...cur, text };
            if (patch.chip.icon !== undefined) {
              if (patch.chip.icon === null || patch.chip.icon === "none") delete next.icon;
              else next.icon = patch.chip.icon;
            }
            if (patch.chip.color !== undefined) {
              if (patch.chip.color === null) delete next.color;
              else next.color = patch.chip.color;
            }
            if (patch.chip.size !== undefined) {
              if (patch.chip.size === null) delete next.size;
              else next.size = Math.max(8, Math.min(64, Math.round(patch.chip.size)));
            }
            nextDisplay.chip = next;
          }
        }
      }
      return { ...w, display: nextDisplay };
    }),
  }));
}

/**
 * Bulk-apply new grid positions after a drag/resize gesture in
 * `EditableDashboardGrid`. Each entry must match a widget already in the
 * layout — we don't create or delete widgets here, only update `pos`.
 *
 * Coordinates are clamped to the 12-col grid so a malformed payload (e.g.
 * the user dragged a wide widget past the right edge in a non-responsive
 * breakpoint) can't break the renderer.
 */
export async function updateLayout(
  dashboardId: string,
  positions: Array<{ id: string; x: number; y: number; w: number; h: number }>,
): Promise<void> {
  const { workspaceId } = await requireEditor();
  // Build a quick lookup so we can apply n positions in O(n) without an
  // inner .find() per widget.
  const byId = new Map(positions.map((p) => [p.id, p]));
  await mutateLayout(dashboardId, workspaceId, (current) => ({
    widgets: current.widgets.map((w) => {
      const next = byId.get(w.id);
      if (!next) return w;
      return {
        ...w,
        pos: {
          x: Math.max(0, Math.min(11, Math.floor(next.x))),
          y: Math.max(0, Math.floor(next.y)),
          w: Math.max(1, Math.min(12, Math.floor(next.w))),
          h: Math.max(1, Math.min(12, Math.floor(next.h))),
        },
      };
    }),
  }));
}
