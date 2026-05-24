"use client";

import { useEffect, useState, useTransition } from "react";
import { Icons } from "@/components/ui/Icon";
import {
  listHubspotPropertiesAction,
  updateHubspotFieldSelectionAction,
} from "@/lib/integrations/actions";
import type {
  HubspotFieldSelection,
  HubspotObjectKey,
  HubspotPickedField,
  HubspotPropertyInfo,
} from "@/lib/integrations/hubspot";

/**
 * Field-picker for a connected HubSpot integration.
 *
 * Lazy-loads the property catalogue from HubSpot (one fetch on first
 * expand) and shows two collapsible groups — Deals + Contacts — with a
 * checkbox per property. Ticking a syncable property turns it on in the
 * query wizard's field dropdown.
 *
 * Custom (non-syncable) properties are listed and rendered grey with a
 * tooltip explaining they aren't queryable yet — we want operators to
 * see them so they know what's available, even if they can't act on
 * them until dynamic-schema work lands.
 */
export function HubspotFieldsPanel({
  initialSelection,
}: {
  initialSelection: HubspotFieldSelection;
}) {
  const [open, setOpen] = useState(false);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [props, setProps] = useState<
    Record<HubspotObjectKey, HubspotPropertyInfo[]> | null
  >(null);
  const [selection, setSelection] = useState<HubspotFieldSelection>(initialSelection);
  const [savedFlash, setSavedFlash] = useState(false);
  const [search, setSearch] = useState("");

  // Lazy: only hit the HubSpot API once the panel is expanded.
  useEffect(() => {
    if (!open || props || loading) return;
    startLoad(async () => {
      const res = await listHubspotPropertiesAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProps(res.properties);

      // Auto-backfill: legacy picks (made before options-capture
      // shipped) only have { name, label, type } — no options. Look
      // up the live discovery entry for each ticked enum and patch in
      // its options. Silently persist so the next query wizard render
      // gets a proper dropdown instead of a useless text input.
      const patched = backfillOptions(selection, res.properties);
      if (patched.changed) {
        setSelection(patched.next);
        // Fire-and-forget — operator doesn't need a UI confirmation
        // for what's effectively a cache refresh.
        updateHubspotFieldSelectionAction(patched.next).catch(() => {
          /* silent — error path is rare and shows up next save */
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(obj: HubspotObjectKey, prop: HubspotPropertyInfo) {
    setSelection((prev) => {
      const current = prev[obj];
      const idx = current.findIndex((f) => f.name === prop.name);
      const next: HubspotPickedField[] =
        idx >= 0
          ? current.filter((_, i) => i !== idx)
          : [
              ...current,
              {
                name: prop.name,
                label: prop.label,
                type: prop.type,
                // Carry enum options so the filter value picker can use them
                // without re-hitting the HubSpot API at query-build time.
                options: prop.options,
              },
            ];
      return { ...prev, [obj]: next };
    });
  }

  function save() {
    setError(null);
    startSave(async () => {
      const res = await updateHubspotFieldSelectionAction(selection);
      if (!res.ok) setError(res.error);
      else {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1800);
      }
    });
  }

  return (
    <div
      style={{
        marginTop: 14,
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        {open ? (
          <Icons.ChevronDown size={14} />
        ) : (
          <Icons.ChevronRight size={14} />
        )}
        Manage fields
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {selection.deals.length + selection.contacts.length} selected
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {loading && (
            <p
              className="t-small"
              style={{ color: "var(--text-muted)", margin: "8px 0" }}
            >
              Loading properties from HubSpot…
            </p>
          )}
          {error && (
            <p
              className="t-small"
              style={{
                color: "var(--danger)",
                background: "var(--danger-soft)",
                padding: "8px 10px",
                borderRadius: 8,
                margin: "8px 0",
              }}
            >
              {error}
            </p>
          )}
          {props && (
            <>
              <div style={{ position: "relative", marginTop: 6 }}>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search fields by name or label…"
                  style={{
                    width: "100%",
                    padding: "10px 36px 10px 12px",
                    background: "var(--bg-elev-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 22,
                      height: 22,
                      display: "grid",
                      placeItems: "center",
                      background: "var(--bg-elev-3, var(--border))",
                      color: "var(--text-muted)",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Icons.Close size={10} />
                  </button>
                )}
              </div>
              <Group
                label="Deals"
                rows={filterByQuery(props.deals, search)}
                selected={new Set(selection.deals.map((f) => f.name))}
                onToggle={(prop) => toggle("deals", prop)}
                totalAvailable={props.deals.length}
              />
              <Group
                label="Contacts"
                rows={filterByQuery(props.contacts, search)}
                selected={new Set(selection.contacts.map((f) => f.name))}
                onToggle={(prop) => toggle("contacts", prop)}
                totalAvailable={props.contacts.length}
              />

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 14,
                }}
              >
                {savedFlash && (
                  <span
                    className="t-small"
                    style={{ color: "var(--success)" }}
                  >
                    ✓ Saved
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save fields"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Patch any ticked enumeration fields that lack `options` with the live
 * discovery options. Returns a new selection object + a `changed` flag
 * so the caller knows whether to persist.
 */
function backfillOptions(
  current: HubspotFieldSelection,
  props: Record<HubspotObjectKey, HubspotPropertyInfo[]>,
): { next: HubspotFieldSelection; changed: boolean } {
  let changed = false;
  function patchGroup(
    group: HubspotPickedField[],
    discovered: HubspotPropertyInfo[],
  ): HubspotPickedField[] {
    return group.map((f) => {
      if (f.options && f.options.length > 0) return f;
      const live = discovered.find((p) => p.name === f.name);
      if (!live || live.type !== "enumeration") return f;
      if (!live.options || live.options.length === 0) return f;
      changed = true;
      return { ...f, type: live.type, options: live.options };
    });
  }
  const next: HubspotFieldSelection = {
    deals: patchGroup(current.deals, props.deals),
    contacts: patchGroup(current.contacts, props.contacts),
  };
  return { next, changed };
}

/** Case-insensitive substring match against both label and internal name. */
function filterByQuery(
  rows: HubspotPropertyInfo[],
  q: string,
): HubspotPropertyInfo[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.label.toLowerCase().includes(needle) ||
      r.name.toLowerCase().includes(needle),
  );
}

function Group({
  label,
  rows,
  selected,
  onToggle,
  totalAvailable,
}: {
  label: string;
  rows: HubspotPropertyInfo[];
  selected: Set<string>;
  onToggle: (prop: HubspotPropertyInfo) => void;
  /** Total before search-filter, so the counter still reads "M available". */
  totalAvailable: number;
}) {
  // Sort: ticked → standard-column → alphabetic. Operators eye-scan for
  // what they already picked, then for the curated set, then everything
  // else (their custom fields).
  const sorted = [...rows].sort((a, b) => {
    const aOn = selected.has(a.name);
    const bOn = selected.has(b.name);
    if (aOn !== bOn) return aOn ? -1 : 1;
    if (a.hasDedicatedColumn !== b.hasDedicatedColumn) {
      return a.hasDedicatedColumn ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
  });

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        <span
          className="t-small"
          style={{ color: "var(--text-muted)" }}
        >
          {selected.size} selected · {sorted.length} shown · {totalAvailable} available
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 4,
          maxHeight: 260,
          overflowY: "auto",
          padding: 4,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
      >
        {sorted.map((p) => {
          const isOn = selected.has(p.name);
          const isCustom = !p.hasDedicatedColumn;
          return (
            <label
              key={p.name}
              title={`${p.label} · ${p.type}${isCustom ? " · custom (stored in JSON)" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: isOn ? "var(--primary-soft)" : "transparent",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--text-primary)",
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(p)}
                style={{ accentColor: "var(--primary)" }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.label}
                </span>
                {p.options && p.options.length > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: 1,
                    }}
                    title={p.options.map((o) => o.label).join(", ")}
                  >
                    {/* Show up to 3 example values so the operator can see
                        what's actually in the enum. */}
                    e.g. {p.options.slice(0, 3).map((o) => o.label).join(", ")}
                    {p.options.length > 3 ? "…" : ""}
                  </span>
                )}
              </span>
              {isCustom && (
                <span
                  className="t-mono"
                  title="Custom field — value stored in custom_properties JSON"
                  style={{
                    fontSize: 9,
                    color: "var(--text-tertiary)",
                    padding: "1px 4px",
                    border: "1px dashed var(--border)",
                    borderRadius: 4,
                    flexShrink: 0,
                  }}
                >
                  custom
                </span>
              )}
              <span
                className="t-mono"
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  padding: "1px 5px",
                  background: "var(--bg-elev-2)",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                {p.type}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
