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
