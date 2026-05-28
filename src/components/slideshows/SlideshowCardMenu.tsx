"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import {
  deleteSlideshow,
  duplicateSlideshow,
  renameSlideshow,
} from "@/lib/slideshows";

/**
 * Per-card overflow menu on each slideshow tile: Rename, Duplicate, Delete.
 * Editors + admins only; viewers don't render the component. Clicks stop
 * propagation so they don't follow the parent <Link> to the editor.
 */
export function SlideshowCardMenu({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(action: () => void) {
    setMenuOpen(false);
    setTimeout(action, 0);
  }

  function onRename() {
    const next = window.prompt("Rename slideshow", name)?.trim();
    if (!next || next === name) return;
    startTransition(async () => {
      await renameSlideshow(id, next);
    });
  }

  function onDuplicate() {
    startTransition(async () => {
      const res = await duplicateSlideshow(id);
      if (res.ok) router.push(`/slideshows/${res.id}/edit`);
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteSlideshow(id);
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
              pick(onDelete);
            }}
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
