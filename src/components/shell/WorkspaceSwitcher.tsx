"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import { createWorkspace } from "@/lib/workspace-actions";

type WorkspaceOption = { id: string; name: string };

/**
 * Admin-only active-workspace switcher, rendered as the first breadcrumb.
 * Selecting a workspace pushes a session override onto the JWT (handled in
 * the `jwt` callback under `trigger === "update"`) and refreshes the route
 * so every server component re-scopes to the new workspace. Admins can also
 * create a new (empty, invite-only) workspace and switch straight into it.
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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCreating(false);
    setName("");
    setError(null);
  }

  async function switchTo(id: string) {
    if (id === current.id || pending) return;
    setPending(true);
    try {
      await update({ workspaceId: id });
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const { id } = await createWorkspace(trimmed);
      await update({ workspaceId: id }); // switch into the new workspace
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Couldn't create workspace");
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
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
            minWidth: 240,
            maxHeight: 380,
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

          <div
            style={{
              height: 1,
              background: "var(--border)",
              margin: "6px 0",
            }}
          />

          {creating ? (
            // Inline create form. Kept OUT of DropdownMenu.Item so the menu
            // doesn't intercept typing / close on click; stop key propagation
            // so Radix's typeahead doesn't steal keystrokes.
            <div style={{ padding: "2px 6px 4px" }}>
              <input
                autoFocus
                value={name}
                placeholder="Workspace name"
                disabled={pending}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") reset();
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-elev-1)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              {error ? (
                <div
                  className="t-small"
                  style={{ color: "var(--danger)", padding: "6px 4px 0" }}
                >
                  {error}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={submitCreate}
                  disabled={pending || !name.trim()}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--primary)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: pending || !name.trim() ? "default" : "pointer",
                    opacity: pending || !name.trim() ? 0.6 : 1,
                  }}
                >
                  {pending ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={pending}
                  style={{
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "none",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setCreating(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                color: "var(--text-secondary)",
                fontSize: 13,
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
              <Icons.Plus size={14} />
              <span>Create workspace</span>
            </button>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
