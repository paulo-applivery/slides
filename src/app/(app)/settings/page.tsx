import { format } from "date-fns";
import { asc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";
import { WorkspaceSettingsCard } from "@/components/settings/WorkspaceSettingsCard";
import { MembersSettingsCard } from "@/components/settings/MembersSettingsCard";
import type { JoinPolicy } from "@/lib/workspace-actions";

/**
 * Settings hub — a stack of self-contained cards, one per settings area.
 * First card: Workspace (full CRUD for admins). More cards (Members,
 * Appearance, Billing, …) slot in below as they're built.
 */
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const isAdmin = session.user.role === "admin";

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, session.user.workspaceId),
    columns: { id: true, name: true, domain: true, joinPolicy: true, createdAt: true },
  });
  if (!ws) redirect("/login");

  // Members of this workspace.
  const members = await db.query.users.findMany({
    where: eq(users.workspaceId, ws.id),
    columns: { id: true, email: true, name: true, role: true },
    orderBy: (u) => [asc(u.email)],
  });

  // Pending = signed-in users with no workspace whose email domain matches
  // this workspace's domain (only meaningful when a domain is set).
  const pending = ws.domain
    ? (
        await db.query.users.findMany({
          where: isNull(users.workspaceId),
          columns: { id: true, email: true, name: true },
        })
      ).filter((u) => u.email.split("@")[1]?.toLowerCase() === ws.domain)
    : [];

  return (
    <>
      <TopBar crumbs={[]} name="Settings" />
      <main className="main">
        <p
          className="t-body"
          style={{ color: "var(--text-tertiary)", margin: "0 0 24px", maxWidth: 640 }}
        >
          Manage your workspace and how Atlas behaves. Changes apply to everyone
          in the workspace.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <WorkspaceSettingsCard
            key={ws.id}
            isAdmin={isAdmin}
            workspace={{
              id: ws.id,
              name: ws.name,
              domain: ws.domain,
              joinPolicy: ws.joinPolicy as JoinPolicy,
              createdAt: format(ws.createdAt, "MMM d, yyyy"),
            }}
          />
          <MembersSettingsCard
            key={`members-${ws.id}`}
            members={members}
            pending={pending}
            currentUserId={session.user.id}
            isAdmin={isAdmin}
          />
          {/* Future settings cards go here. */}
        </div>
      </main>
    </>
  );
}
