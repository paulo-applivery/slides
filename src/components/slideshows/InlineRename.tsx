"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { renameSlideshow } from "@/lib/slideshows";

/** Click-to-edit slideshow name shown in the TopBar. */
export function InlineRename({
  id,
  initialName,
}: {
  id: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(initialName);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    setName(initialName);
    savedRef.current = initialName;
  }, [initialName]);

  function commit() {
    setEditing(false);
    const next = name.trim();
    if (!next || next === savedRef.current) {
      setName(savedRef.current);
      return;
    }
    savedRef.current = next;
    startTransition(async () => {
      await renameSlideshow(id, next);
    });
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
            setName(savedRef.current);
            setEditing(false);
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
          minWidth: 160,
          outline: "none",
        }}
        aria-label="Slideshow name"
      />
    );
  }

  return (
    <button
      type="button"
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
