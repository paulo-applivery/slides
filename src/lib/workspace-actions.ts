"use server";

/**
 * Workspace-level mutations driven from the UI (the admin workspace
 * switcher and the Settings → Workspace card). Distinct from `workspace.ts`,
 * which holds the sign-in domain-attach logic.
 *
 * All mutations are admin-only. Errors throw with a human-readable message;
 * callers catch and surface via toast / inline field errors.
 */
import { eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";

const JOIN_POLICIES = ["domain-auto", "invite-only"] as const;
export type JoinPolicy = (typeof JOIN_POLICIES)[number];

class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") throw new ForbiddenError();
  return session;
}

/** Map a unique-domain collision onto a friendly message. */
function rethrowFriendly(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (/unique|constraint/i.test(msg) && /domain/i.test(msg)) {
    throw new Error("That domain is already used by another workspace");
  }
  throw err instanceof Error ? err : new Error(msg);
}

/**
 * Create a new workspace. The workspace is `invite-only` and has no domain,
 * so it never auto-absorbs users by email domain — it's a deliberate, empty
 * space the creator can then switch into.
 */
export async function createWorkspace(name: string): Promise<{ id: string }> {
  await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");

  const [created] = await db
    .insert(workspaces)
    .values({ name: trimmed, joinPolicy: "invite-only" })
    .returning({ id: workspaces.id });

  revalidatePath("/", "layout");
  return { id: created.id };
}

/** Update a workspace's name, domain, and join policy. */
export async function updateWorkspace(input: {
  id: string;
  name: string;
  domain: string | null;
  joinPolicy: JoinPolicy;
}): Promise<void> {
  await requireAdmin();

  const name = input.name.trim();
  if (!name) throw new Error("Workspace name is required");
  if (!JOIN_POLICIES.includes(input.joinPolicy)) {
    throw new Error("Invalid join policy");
  }
  const domain = input.domain?.trim().toLowerCase() || null;
  // domain-auto only makes sense with a domain to match against.
  if (input.joinPolicy === "domain-auto" && !domain) {
    throw new Error("Set a domain to use the domain-auto join policy");
  }

  try {
    const updated = await db
      .update(workspaces)
      .set({ name, domain, joinPolicy: input.joinPolicy })
      .where(eq(workspaces.id, input.id))
      .returning({ id: workspaces.id });
    if (updated.length === 0) throw new Error("Workspace not found");
  } catch (err) {
    rethrowFriendly(err);
  }

  revalidatePath("/", "layout");
}

/**
 * Delete a workspace and everything in it (data tables cascade; member
 * users get workspace_id = null). Returns another workspace to fall back
 * to, or null if this was the last one — the caller switches the session
 * there (or signs out).
 */
export async function deleteWorkspace(
  id: string,
): Promise<{ nextWorkspaceId: string | null }> {
  await requireAdmin();

  const deleted = await db
    .delete(workspaces)
    .where(eq(workspaces.id, id))
    .returning({ id: workspaces.id });
  if (deleted.length === 0) throw new Error("Workspace not found");

  const fallback = await db.query.workspaces.findFirst({
    where: ne(workspaces.id, id),
    columns: { id: true },
  });

  revalidatePath("/", "layout");
  return { nextWorkspaceId: fallback?.id ?? null };
}
