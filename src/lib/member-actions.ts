"use server";

/**
 * Member management for the current workspace — driven from
 * Settings → Members. Admin-only. Membership is modelled by
 * `users.workspaceId`; a "pending" user is one with a null workspace
 * whose email domain matches this workspace.
 *
 * Errors throw with a human-readable message; the client surfaces them
 * via toast.
 */
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { Role } from "@/lib/roles";

const ROLES: Role[] = ["admin", "editor", "viewer"];

class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

async function requireAdmin() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId ?? null;
  if (session?.user?.role !== "admin" || !workspaceId) throw new ForbiddenError();
  return { userId: session.user.id, workspaceId };
}

/** Number of admins currently in a workspace. */
async function adminCount(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.workspaceId, workspaceId), eq(users.role, "admin")));
  return rows.length;
}

/** Change a member's role within the current workspace. */
export async function changeMemberRole(userId: string, role: Role): Promise<void> {
  const { workspaceId } = await requireAdmin();
  if (!ROLES.includes(role)) throw new Error("Invalid role");

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, workspaceId: true },
  });
  if (!target || target.workspaceId !== workspaceId) {
    throw new Error("User is not a member of this workspace");
  }
  if (target.role === role) return;

  // Don't strip the last admin — it would orphan the workspace.
  if (target.role === "admin" && role !== "admin" && (await adminCount(workspaceId)) <= 1) {
    throw new Error("Can't change the last admin's role");
  }

  await db.update(users).set({ role }).where(eq(users.id, userId));
  revalidatePath("/settings");
}

/**
 * Accept a pending user into the current workspace with a role. The user
 * must not already belong to a workspace (guards against poaching members
 * from another workspace).
 */
export async function acceptMember(
  userId: string,
  role: Role = "editor",
): Promise<void> {
  const { workspaceId } = await requireAdmin();
  if (!ROLES.includes(role)) throw new Error("Invalid role");

  const target = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.workspaceId)),
    columns: { id: true },
  });
  if (!target) throw new Error("User is not pending (already in a workspace)");

  await db.update(users).set({ workspaceId, role }).where(eq(users.id, userId));
  revalidatePath("/settings");
}

/** Remove a member from the current workspace (detach — sets workspace null). */
export async function removeMember(userId: string): Promise<void> {
  const { userId: actorId, workspaceId } = await requireAdmin();
  if (userId === actorId) throw new Error("You can't remove yourself");

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, workspaceId: true },
  });
  if (!target || target.workspaceId !== workspaceId) {
    throw new Error("User is not a member of this workspace");
  }
  if (target.role === "admin" && (await adminCount(workspaceId)) <= 1) {
    throw new Error("Can't remove the last admin");
  }

  await db.update(users).set({ workspaceId: null }).where(eq(users.id, userId));
  revalidatePath("/settings");
}
