"use client";

import { useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import { deleteQueryAction, runQueryAction } from "@/lib/queries/actions";

/** Per-row dropdown: Run now, Delete. Hidden for viewers. */
export function QueryRowMenu({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu.Root>
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
            minWidth: 180,
            zIndex: 100,
          }}
        >
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              startTransition(async () => {
                await runQueryAction(id);
              });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 8,
              color: "var(--text-secondary)",
              fontSize: 13,
              cursor: "pointer",
              outline: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <Icons.Refresh size={14} /> Run now
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
              startTransition(async () => {
                await deleteQueryAction(id);
              });
            }}
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
