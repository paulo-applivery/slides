"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import {
  archiveDashboard,
  duplicateDashboard,
  renameDashboard,
} from "@/lib/dashboards";
import { toast } from "@/lib/toast";

/**
 * Per-card overflow menu shown on each dashboard tile. Editors + admins
 * see it; viewers don't render the component at all. Clicks stop
 * propagation so they don't follow the parent <Link> to the detail page.
 */
export function DashboardCardMenu({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(action: () => void) {
    setMenuOpen(false);
    // Defer to next tick so the dropdown's exit can start cleanly before
    // any navigation / confirm / prompt mounts.
    setTimeout(action, 0);
  }

  function onRename() {
    const next = window.prompt("Rename dashboard", name)?.trim();
    if (!next || next === name) return;
    startTransition(async () => {
      try {
        await renameDashboard(id, next);
        toast.success({ title: "Dashboard renamed" });
      } catch (err) {
        toast.error({
          title: "Couldn't rename dashboard",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  function onDuplicate() {
    startTransition(async () => {
      const res = await duplicateDashboard(id);
      if (res.ok) {
        toast.success({ title: "Dashboard duplicated" });
        router.push(`/dashboards/${res.id}`);
      } else {
        toast.error({
          title: "Couldn't duplicate dashboard",
          description: res.error,
        });
      }
    });
  }

  function onArchive() {
    if (!confirm(`Archive "${name}"? You can restore it later from Settings.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await archiveDashboard(id);
        toast.success({ title: "Dashboard archived" });
      } catch (err) {
        toast.error({
          title: "Couldn't archive dashboard",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="widget-iconbtn"
          aria-label={`Open menu for ${name}`}
          onClick={(e) => e.preventDefault()}
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
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-md)",
            padding: 6,
            minWidth: 180,
            zIndex: 100,
          }}
        >
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              pick(onRename);
            }}
            style={itemStyle("normal")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <Icons.Edit size={14} /> Rename
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              pick(onDuplicate);
            }}
            style={itemStyle("normal")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <Icons.Copy size={14} /> Duplicate
          </DropdownMenu.Item>
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              pick(onArchive);
            }}
            style={itemStyle("danger")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--danger-soft)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <Icons.Close size={14} /> Archive
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
