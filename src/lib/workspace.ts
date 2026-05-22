/**
 * Workspace bootstrap logic — fires from the Auth.js `signIn` event the
 * first time we see a Google identity for a given email.
 *
 * Rules:
 *  - The email's domain identifies the candidate workspace.
 *  - First user on a domain → creates a new workspace, becomes `admin`.
 *  - Subsequent users with the same domain:
 *      - workspace `joinPolicy = "domain-auto"` → auto-join as `editor`.
 *      - workspace `joinPolicy = "invite-only"` → stays role `viewer` and
 *        un-attached; an admin must invite them manually (Phase 5).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";

function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

function workspaceNameFromDomain(domain: string): string {
  // "acme.io" → "Acme"
  const core = domain.split(".")[0] ?? domain;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

export async function attachUserToWorkspace(userId: string, email: string) {
  const domain = domainFromEmail(email);
  if (!domain) return;

  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.domain, domain),
  });

  if (!existing) {
    // First user on this domain: bootstrap a workspace and promote to admin.
    const [created] = await db
      .insert(workspaces)
      .values({ name: workspaceNameFromDomain(domain), domain })
      .returning({ id: workspaces.id });
    await db
      .update(users)
      .set({ workspaceId: created.id, role: "admin" })
      .where(eq(users.id, userId));
    return;
  }

  if (existing.joinPolicy === "domain-auto") {
    await db
      .update(users)
      .set({ workspaceId: existing.id, role: "editor" })
      .where(eq(users.id, userId));
  }
  // invite-only: leave workspaceId null until an admin invites them.
}
