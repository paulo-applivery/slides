"use server";

/**
 * Workspace-level mutations driven from the UI (the admin workspace
 * switcher). Distinct from `workspace.ts`, which holds the sign-in
 * domain-attach logic.
 */
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";

class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

/**
 * Create a new workspace. Admin-only. The workspace is `invite-only` and
 * has no domain, so it never auto-absorbs users by email domain — it's a
 * deliberate, empty space the creator can then switch into.
 */
export async function createWorkspace(name: string): Promise<{ id: string }> {
  const session = await auth();
  if (session?.user?.role !== "admin") throw new ForbiddenError();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");

  const [created] = await db
    .insert(workspaces)
    .values({ name: trimmed, joinPolicy: "invite-only" })
    .returning({ id: workspaces.id });

  revalidatePath("/", "layout");
  return { id: created.id };
}
