"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import {
  deleteQueryAction,
  duplicateQueryAction,
  runQueryAction,
} from "@/lib/queries/actions";
import { toast } from "@/lib/toast";

/** Per-row dropdown: Edit, Duplicate, Run now, Delete. Hidden for viewers. */
export function QueryRowMenu({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(action: () => void) {
    setMenuOpen(false);
    // Defer to next tick so the dropdown's exit can start cleanly
    // before any navigation / confirm / dialog mount.
    setTimeout(action, 0);
  }

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="widget-iconbtn"
          aria-label={`Open menu for ${name}`}
          disabled={pending}
          style={{
            width: 28,
            height: 28,
            display: "grid",
            placeItems: "center",
            borderRadius: 6,
          }}
        >
          <Icons.More size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-md)",
            padding: 6,
            minWidth: 200,
            zIndex: 100,
          }}
        >
          <DropdownMenu.Item
            onSelect={() => pick(() => router.push(`/queries/${id}/edit`))}
            style={itemStyle("normal")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <Icons.Edit size={14} /> Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() =>
              pick(() =>
                startTransition(async () => {
                  const res = await duplicateQueryAction(id);
                  if (res.ok) {
                    toast.success({ title: "Query duplicated" });
                    router.push(`/queries/${res.id}/edit`);
                  } else {
                    toast.error({
                      title: "Couldn't duplicate query",
                      description: res.error,
                    });
                  }
                }),
              )
            }
            style={itemStyle("normal")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <Icons.Plus size={14} /> Duplicate
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() =>
              pick(() =>
                startTransition(async () => {
                  try {
                    await runQueryAction(id);
                    toast.success({ title: "Query run" });
                  } catch (err) {
                    toast.error({
                      title: "Couldn't run query",
                      description: err instanceof Error ? err.message : undefined,
                    });
                  }
                }),
              )
            }
            style={itemStyle("normal")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <Icons.Refresh size={14} /> Run now
          </DropdownMenu.Item>
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
          <DropdownMenu.Item
            onSelect={() =>
              pick(() => {
                if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
                startTransition(async () => {
                  try {
                    await deleteQueryAction(id);
                    toast.success({ title: "Query deleted" });
                  } catch (err) {
                    toast.error({
                      title: "Couldn't delete query",
                      description: err instanceof Error ? err.message : undefined,
                    });
                  }
                });
              })
            }
            style={itemStyle("danger")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--danger-soft)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <Icons.Close size={14} /> Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function itemStyle(tone: "normal" | "danger"): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    color: tone === "danger" ? "var(--danger)" : "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    outline: "none",
  };
}
