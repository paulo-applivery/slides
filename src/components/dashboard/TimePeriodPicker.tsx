"use client";

import { useMemo, useState } from "react";
import {
  PICKER_CATEGORIES,
  PICKER_PRESETS,
  categoryOf,
  resolveTimePeriod,
  type Granularity,
  type PickerCategory,
  type TimePeriod,
} from "@/lib/timePeriod";

/**
 * Inline time-period picker.
 *
 * Two-row layout:
 *   1. Category tabs (Current · Previous · Next · All time · Advanced · Fixed)
 *   2. Tab body — preset list for the simple categories, a small form for
 *      Advanced (rolling N + unit) and Fixed (start / end date inputs).
 *
 * The current resolution (start → end) is displayed at the bottom so the
 * operator can verify "what does Current Quarter actually mean today?".
 *
 * No internal "Apply" — the parent dialog owns Save/Cancel.
 */
export function TimePeriodPicker({
  value,
  onChange,
}: {
  value: TimePeriod | undefined;
  onChange: (v: TimePeriod) => void;
}) {
  // Default to the most common pick if nothing is set yet.
  const effective = value ?? ({ kind: "current", granularity: "month" } as TimePeriod);

  // Active category — derived from the value but stored so a user can
  // explore a different tab without changing their selection.
  const [activeCat, setActiveCat] = useState<PickerCategory>(categoryOf(effective));

  // Local draft state for the Advanced + Fixed forms; mirrored back via
  // onChange whenever the operator nudges a control so the dialog's
  // resolved-range readout stays in sync.
  const rolling =
    effective.kind === "rolling"
      ? effective
      : ({ kind: "rolling", n: 30, granularity: "day" } as Extract<TimePeriod, { kind: "rolling" }>);
  const fixed =
    effective.kind === "fixed"
      ? effective
      : ({
          kind: "fixed",
          start: new Date().toISOString().slice(0, 10),
          end: new Date().toISOString().slice(0, 10),
        } as Extract<TimePeriod, { kind: "fixed" }>);

  const resolved = useMemo(() => resolveTimePeriod(effective), [effective]);

  return (
    <div>
      {/* Category tabs */}
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--border)",
          marginBottom: 14,
          overflowX: "auto",
        }}
      >
        {PICKER_CATEGORIES.map((c) => {
          const active = c.id === activeCat;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveCat(c.id)}
              style={{
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${active ? "var(--primary)" : "transparent"}`,
                color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                fontWeight: active ? 500 : 400,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div style={{ minHeight: 180 }}>
        {(activeCat === "current" ||
          activeCat === "previous" ||
          activeCat === "next" ||
          activeCat === "allTime") && (
          <PresetList
            presets={PICKER_PRESETS[activeCat]}
            value={effective}
            onPick={onChange}
          />
        )}
        {activeCat === "advanced" && (
          <AdvancedForm
            value={rolling}
            onChange={(next) => onChange(next)}
          />
        )}
        {activeCat === "fixed" && (
          <FixedForm value={fixed} onChange={(next) => onChange(next)} />
        )}
      </div>

      {/* Resolved range */}
      <div
        style={{
          marginTop: 14,
          padding: "10px 14px",
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 12,
          color: "var(--text-secondary)",
        }}
      >
        <span style={{ color: "var(--text-tertiary)" }}>Resolves to</span>
        <span
          className="t-mono"
          style={{ color: "var(--text-primary)", fontWeight: 500 }}
        >
          {resolved.start && resolved.end
            ? `${resolved.start} → ${resolved.end}`
            : "All time"}
        </span>
      </div>
    </div>
  );
}

function PresetList({
  presets,
  value,
  onPick,
}: {
  presets: Array<{ label: string; period: TimePeriod }>;
  value: TimePeriod;
  onPick: (v: TimePeriod) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {presets.map((p) => {
        const active = periodsEqual(p.period, value);
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onPick(p.period)}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              background: active ? "var(--primary-soft)" : "transparent",
              color: active ? "var(--primary)" : "var(--text-secondary)",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
              fontWeight: active ? 500 : 400,
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "var(--bg-elev-2)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "transparent";
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function AdvancedForm({
  value,
  onChange,
}: {
  value: Extract<TimePeriod, { kind: "rolling" }>;
  onChange: (v: Extract<TimePeriod, { kind: "rolling" }>) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 90px 1fr",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Last</span>
      <input
        type="number"
        min={1}
        max={365}
        value={value.n}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n) && n > 0) onChange({ ...value, n });
        }}
        style={{
          padding: "8px 10px",
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 14,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-primary)",
        }}
      />
      <select
        value={value.granularity}
        onChange={(e) =>
          onChange({ ...value, granularity: e.target.value as Granularity })
        }
        style={{
          padding: "8px 10px",
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 14,
          color: "var(--text-primary)",
        }}
      >
        <option value="day">days</option>
        <option value="week">weeks</option>
        <option value="month">months</option>
        <option value="quarter">quarters</option>
        <option value="year">years</option>
      </select>
    </div>
  );
}

function FixedForm({
  value,
  onChange,
}: {
  value: Extract<TimePeriod, { kind: "fixed" }>;
  onChange: (v: Extract<TimePeriod, { kind: "fixed" }>) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>From</span>
        <input
          type="date"
          value={value.start}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
          style={dateInputStyle}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>To</span>
        <input
          type="date"
          value={value.end}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
          style={dateInputStyle}
        />
      </label>
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "var(--bg-elev-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 14,
  color: "var(--text-primary)",
  fontFamily: "inherit",
};

function periodsEqual(a: TimePeriod, b: TimePeriod): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "allTime":
      return true;
    case "fixed":
      return b.kind === "fixed" && a.start === b.start && a.end === b.end;
    case "rolling":
      return (
        b.kind === "rolling" && a.n === b.n && a.granularity === b.granularity
      );
    case "toDate":
      return b.kind === "toDate" && a.granularity === b.granularity;
    case "current":
    case "previous":
    case "next":
      return (
        b.kind === a.kind &&
        "granularity" in b &&
        b.granularity === a.granularity
      );
  }
}
