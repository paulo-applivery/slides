import type { ReactNode } from "react";
import { auth } from "@/auth";
import { Icons } from "@/components/ui/Icon";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { workspaces } from "@/lib/db/schema";
import { UserMenu } from "./UserMenu";
import { AppearanceMenu } from "@/components/theme/AppearanceMenu";

/**
 * Top bar with breadcrumb, contextual right-side actions, divider, bell + avatar.
 * Server component — reads the session + workspace once per request.
 */
export type TopBarProps = {
  crumbs: string[];
  /** Page title in the rightmost breadcrumb slot. Accepts an element so
   * routes can drop in an inline editor (e.g. `<InlineRename/>`). */
  name: ReactNode;
  actions?: ReactNode;
};

async function getWorkspaceName(workspaceId: string | null | undefined) {
  if (!workspaceId) return "No workspace";
  const row = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { name: true },
  });
  return row?.name ?? "Workspace";
}

export async function TopBar({ crumbs, name, actions }: TopBarProps) {
  const session = await auth();
  const workspaceName = await getWorkspaceName(session?.user?.workspaceId ?? null);
  const initials = initialsFromName(session?.user?.name ?? session?.user?.email);

  return (
    <header className="tb">
      <div className="tb-title">
        <span className="tb-crumb">{workspaceName}</span>
        {crumbs.map((c) => (
          <span key={c} style={{ display: "contents" }}>
            <span className="tb-crumb-sep">/</span>
            <span className="tb-crumb">{c}</span>
          </span>
        ))}
        <span className="tb-crumb-sep">/</span>
        <span className="tb-name">
          {name} <Icons.ChevronDown size={13} />
        </span>
      </div>
      <div className="tb-r">
        {actions}
        <span
          className="tb-divider"
          style={{ width: 1, height: 24, background: "var(--border)" }}
        />
        <AppearanceMenu />
        <button className="btn btn-ghost btn-icon" aria-label="Notifications">
          <Icons.Bell size={16} />
        </button>
        <UserMenu
          initials={initials}
          name={session?.user?.name ?? "Anonymous"}
          email={session?.user?.email ?? ""}
        />
      </div>
    </header>
  );
}

function initialsFromName(name?: string | null): string {
  if (!name) return "•";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
