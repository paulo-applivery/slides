"use client";

import { useMemo } from "react";
import { Icons } from "@/components/ui/Icon";
import {
  FILTER_OPS,
  FILTER_OP_LABEL,
  opIsMultiValue,
  opIsUnary,
  type Filter,
  type FilterOp,
  type Source,
} from "@/lib/queries/ast";
import { fieldsForSource, type SourceObject } from "@/lib/queries/catalog";

/**
 * Filter editor — used in two places today:
 *   1. The query wizard's Step 5 (filters baked into the saved query)
 *   2. The Edit Widget dialog's "Filters" tab (per-widget overlay
 *      AND'd with the bound query's own filters)
 *
 * Lives in its own file (rather than inside QueryWizard) so the
 * dashboard route doesn't have to pull the whole wizard bundle in
 * just to render the widget editor.
 *
 * Field menu:
 *   - Standard fields from `SOURCE_FIELDS`, narrowed by `object`
 *     (HubSpot deals vs contacts)
 *   - `allowedFields` further restricts to the operator's
 *     /integrations selection
 *   - `standardEnumOptions` swaps in live HubSpot enum values
 *     (pipeline IDs, stage IDs, lifecycle stage IDs from the
 *     connected portal) for any standard field that has them
 *   - `customFields` are appended as virtual `custom:<propName>`
 *     entries; the executor's `compileFilter` resolves them via
 *     `json_extract(custom_properties, '$.<propName>')`
 */
export type CustomFieldOption = {
  id: string;
  label: string;
  type: string;
  options?: Array<{ label: string; value: string }>;
};

export function FiltersEditor({
  source,
  object,
  filters,
  onChange,
  allowedFields,
  customFields,
  standardEnumOptions,
}: {
  source: Source;
  /**
   * Narrow the filter field menu to one HubSpot object so deal-only
   * properties (Pipeline, Deal stage) don't show up on a Contacts
   * query and vice versa.
   */
  object: SourceObject;
  filters: Filter[];
  onChange: (next: Filter[]) => void;
  /** Field-id allow-list from the parent (operator's /integrations selection). */
  allowedFields?: string[];
  /** Custom (JSON-backed) fields, surfaced inline with the standard ones. */
  customFields?: CustomFieldOption[];
  /**
   * Live enum options for standard fields, keyed by internal field id.
   * Overrides any hardcoded `enumValues` in SOURCE_FIELDS so the value
   * picker uses real pipeline / stage / owner IDs from the connected
   * portal.
   */
  standardEnumOptions?: Record<
    string,
    Array<{ label: string; value: string }>
  >;
}) {
  const allFields = useMemo(() => {
    const all = fieldsForSource(source, undefined, object);
    const standardBase = allowedFields
      ? all.filter((f) => allowedFields.includes(f.id))
      : all;
    // Apply live enum overrides — when the operator picked a HubSpot
    // enumeration property (Pipeline, Deal Stage, Lifecycle Stage),
    // swap in its real options.
    const standard = standardBase.map((f) => {
      const live = standardEnumOptions?.[f.id];
      if (live && live.length > 0) {
        return { ...f, type: "enum" as const, enumValues: live };
      }
      return f;
    });
    // Append custom fields as virtual entries. HubSpot `enumeration`
    // → our `enum` FieldType (so the value renders as a dropdown).
    // Anything we don't recognise falls back to `string` → text input.
    // Same Deal/Contact label heuristic the Function step uses — keep
    // contact customs out of the deal filter menu and vice versa.
    const customAsFields = (customFields ?? [])
      .filter((c) => {
        if (source !== "hubspot") return true;
        const isContact = c.label?.startsWith("Contact");
        return object === "contacts" ? isContact : !isContact;
      })
      .map((c) => ({
        id: c.id,
        source,
        label: c.label,
        type:
          c.type === "number"
            ? ("numeric" as const)
            : c.type === "datetime"
              ? ("date" as const)
              : c.type === "bool"
                ? ("boolean" as const)
                : c.type === "enumeration"
                  ? ("enum" as const)
                  : ("string" as const),
        enumValues: c.options,
      }));
    return [...standard, ...customAsFields];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, object, allowedFields, customFields]);

  function addFilter() {
    const first = allFields[0];
    if (!first) return;
    onChange([...filters, { field: first.id, op: "eq", value: "" }]);
  }

  function updateAt(idx: number, patch: Partial<Filter>) {
    onChange(filters.map((f, i) => (i === idx ? ({ ...f, ...patch } as Filter) : f)));
  }

  function removeAt(idx: number) {
    onChange(filters.filter((_, i) => i !== idx));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {filters.length === 0 && (
        <p
          className="t-small"
          style={{ color: "var(--text-muted)", margin: "0 0 4px" }}
        >
          No filters yet — all records match.
        </p>
      )}
      {filters.map((f, idx) => {
        const fieldDef = allFields.find((a) => a.id === f.field);
        const unary = opIsUnary(f.op);
        const multi = opIsMultiValue(f.op);
        return (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 130px 1fr 32px",
              gap: 8,
              alignItems: "center",
            }}
          >
            <select
              value={f.field}
              onChange={(e) => updateAt(idx, { field: e.target.value })}
              style={selectStyle}
            >
              {allFields.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => {
                const nextOp = e.target.value as FilterOp;
                const becameMulti = opIsMultiValue(nextOp);
                const wasMulti = opIsMultiValue(f.op);
                let nextValue: Filter["value"] = f.value;
                if (becameMulti && !wasMulti) nextValue = [];
                if (!becameMulti && wasMulti) nextValue = "";
                if (opIsUnary(nextOp)) nextValue = undefined;
                updateAt(idx, { op: nextOp, value: nextValue });
              }}
              style={selectStyle}
            >
              {FILTER_OPS.map((op) => (
                <option key={op} value={op}>
                  {FILTER_OP_LABEL[op]}
                </option>
              ))}
            </select>
            {unary ? (
              <span
                className="t-small"
                style={{
                  color: "var(--text-muted)",
                  padding: "10px 12px",
                  background: "var(--bg-elev-2)",
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                }}
              >
                (no value)
              </span>
            ) : multi && fieldDef?.enumValues ? (
              <MultiEnumPicker
                options={fieldDef.enumValues}
                value={Array.isArray(f.value) ? (f.value as string[]) : []}
                onChange={(next) => updateAt(idx, { value: next })}
              />
            ) : multi ? (
              <input
                type="text"
                value={Array.isArray(f.value) ? f.value.join(", ") : ""}
                onChange={(e) =>
                  updateAt(idx, {
                    value: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="value1, value2, value3"
                style={inputStyle}
              />
            ) : fieldDef?.enumValues ? (
              <select
                value={typeof f.value === "string" ? f.value : ""}
                onChange={(e) => updateAt(idx, { value: e.target.value })}
                style={selectStyle}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {fieldDef.enumValues.map((v: { label: string; value: string }) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={
                  typeof f.value === "string"
                    ? f.value
                    : typeof f.value === "number"
                      ? String(f.value)
                      : ""
                }
                onChange={(e) => updateAt(idx, { value: e.target.value })}
                placeholder="value"
                style={inputStyle}
              />
            )}
            <button
              type="button"
              className="widget-iconbtn"
              aria-label="Remove filter"
              onClick={() => removeAt(idx)}
              style={{ width: 32, height: 32 }}
            >
              <Icons.Close size={12} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={addFilter}
        disabled={allFields.length === 0}
        style={{ alignSelf: "flex-start", marginTop: 4 }}
      >
        <Icons.Plus size={14} /> Add filter
      </button>
    </div>
  );
}

/**
 * Multi-value picker for `is any of` / `is none of` on enum fields.
 *
 * Renders as a chip strip: each picked option is a removable pill, plus
 * a "+ Add" select to add another. Better than a comma-separated text
 * input — operators don't need to remember the internal enum values.
 */
function MultiEnumPicker({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const remaining = options.filter((o) => !value.includes(o.value));
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        padding: 6,
        minHeight: 38,
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      {value.map((v) => {
        const opt = options.find((o) => o.value === v);
        return (
          <span
            key={v}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 4px 3px 8px",
              background: "var(--primary-soft)",
              color: "var(--primary)",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {opt?.label ?? v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              aria-label={`Remove ${opt?.label ?? v}`}
              style={{
                width: 16,
                height: 16,
                display: "grid",
                placeItems: "center",
                background: "transparent",
                color: "currentColor",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ×
            </button>
          </span>
        );
      })}
      {remaining.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            onChange([...value, e.target.value]);
          }}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 12,
            color: "var(--text-tertiary)",
            cursor: "pointer",
            padding: "2px 4px",
            minWidth: 80,
          }}
        >
          <option value="">+ Add value…</option>
          {remaining.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg-elev-2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  color: "var(--text-primary)",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  background: "var(--bg-elev-2)",
};
