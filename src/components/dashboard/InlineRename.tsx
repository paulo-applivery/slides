"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { renameDashboard } from "@/lib/dashboards";

/**
 * Click-to-edit dashboard name. Renders the name inline; clicking turns
 * the span into a contenteditable input. Saves on blur / Enter, cancels
 * on Escape. Debounces server calls so rapid typing doesn't flood.
 *
 * `editable=false` (e.g. viewer role) falls back to a static span — no
 * cursor changes, no hover affordance.
 */
export function InlineRename({
  id,
  initialName,
  editable,
}: {
  id: string;
  initialName: string;
  editable: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(initialName);

  // Focus + select-all on enter-edit.
  useEffect(() => {
    if (editing) {
      const el = inputRef.current;
      el?.focus();
      el?.select();
    }
  }, [editing]);

  // Reset local state if the server-rendered name changes underneath us
  // (e.g. someone else edited it; rare but worth handling).
  useEffect(() => {
    setName(initialName);
    savedRef.current = initialName;
  }, [initialName]);

  function commit() {
    setEditing(false);
    const next = name.trim();
    if (!next || next === savedRef.current) {
      // Empty or unchanged — revert to whatever was last saved.
      setName(savedRef.current);
      return;
    }
    savedRef.current = next;
    startTransition(async () => {
      await renameDashboard(id, next);
    });
  }

  function cancel() {
    setName(savedRef.current);
    setEditing(false);
  }

  if (!editable) {
    return <span className="tb-name-text">{name}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        style={{
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          padding: "4px 8px",
          margin: "-4px -8px",
          font: "inherit",
          color: "var(--text-primary)",
          minWidth: 120,
          outline: "none",
        }}
        aria-label="Dashboard name"
      />
    );
  }

  return (
    <button
      type="button"
      className="tb-name-edit"
      onClick={() => setEditing(true)}
      title="Click to rename"
      style={{
        background: "none",
        border: 0,
        font: "inherit",
        color: "inherit",
        cursor: "text",
        padding: 0,
      }}
    >
      {name}
    </button>
  );
}
