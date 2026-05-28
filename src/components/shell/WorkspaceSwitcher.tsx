"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";

type WorkspaceOption = { id: string; name: string };

/**
 * Admin-only active-workspace switcher, rendered as the first breadcrumb.
 * Selecting a workspace pushes a session override onto the JWT (handled in
 * the `jwt` callback under `trigger === "update"`) and refreshes the route
 * so every server component re-scopes to the new workspace.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceOption;
  workspaces: WorkspaceOption[];
}) {
  const { update } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function switchTo(id: string) {
    if (id === current.id || pending) return;
    setPending(true);
    try {
      await update({ workspaceId: id });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="tb-crumb"
          aria-label="Switch workspace"
          disabled={pending}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "none",
            border: "none",
            cursor: pending ? "wait" : "pointer",
            font: "inherit",
            color: "inherit",
            padding: "2px 4px",
            borderRadius: 6,
            opacity: pending ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-elev-2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
        >
          {current.name}
          <Icons.ChevronDown size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-md)",
            padding: 6,
            minWidth: 220,
            maxHeight: 360,
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          <div
            className="t-small"
            style={{ padding: "6px 12px 8px", color: "var(--text-secondary)" }}
          >
            Switch workspace
          </div>
          {workspaces.map((ws) => {
            const active = ws.id === current.id;
            return (
              <DropdownMenu.Item key={ws.id} asChild>
                <button
                  type="button"
                  onClick={() => switchTo(ws.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    color: active ? "var(--text)" : "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-elev-2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                  }}
                >
                  <Icons.Globe size={14} />
                  <span style={{ flex: 1 }}>{ws.name}</span>
                  {active ? <Icons.Check size={14} /> : null}
                </button>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
