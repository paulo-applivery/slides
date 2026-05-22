"use client";

import { useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import { archiveDashboard } from "@/lib/dashboards";

/**
 * Per-card overflow menu shown on each dashboard tile. Editors + admins
 * see it; viewers don't render the component at all. Clicks stop
 * propagation so they don't follow the parent <Link> to the detail page.
 */
export function DashboardCardMenu({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function onArchive(e: Event) {
    e.preventDefault();
    if (!confirm(`Archive "${name}"? You can restore it later from Settings.`)) {
      return;
    }
    startTransition(async () => {
      await archiveDashboard(id);
    });
  }

  return (
    <DropdownMenu.Root>
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
            onSelect={onArchive}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 8,
              color: "var(--danger)",
              fontSize: 13,
              cursor: "pointer",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--danger-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "";
            }}
          >
            <Icons.Close size={14} /> Archive
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
