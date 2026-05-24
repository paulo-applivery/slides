"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icons, type IconName } from "@/components/ui/Icon";
import { updateWidgetDisplay } from "@/lib/dashboards";
import {
  CHIP_COLORS,
  CHIP_ICONS,
  type ChipColorKey,
  type ChipIconKey,
  type WidgetChip,
} from "./widgetChip";
import { TimePeriodPicker } from "./TimePeriodPicker";
import type { TimePeriod } from "@/lib/timePeriod";

/**
 * Tabbed widget editor — Display + Time period today; future tabs (Data,
 * Settings) will land here without disturbing the dialog plumbing.
 *
 * The Display tab covers title + size and optional chip (icon + colour
 * + text + size). The Time period tab hosts the `<TimePeriodPicker>`
 * with Current / Previous / Next / All time / Advanced / Fixed sub-tabs.
 *
 * A single footer Save commits the whole shape via `updateWidgetDisplay`
 * which `revalidatePath`s the dashboard.
 */
export function EditWidgetDialog({
  open,
  onOpenChange,
  dashboardId,
  widgetId,
  widgetType,
  currentTitle,
  currentTitleSize,
  currentTitleAlign,
  currentChip,
  currentTimePeriod,
  currentTarget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  widgetId: string;
  /** Surfaces widget-type-specific fields (e.g. Target on a gauge). */
  widgetType: string;
  currentTitle: string;
  currentTitleSize?: number;
  /** Current title alignment. */
  currentTitleAlign?: "left" | "center" | "right";
  currentChip?: WidgetChip;
  currentTimePeriod?: TimePeriod;
  /** Current gauge target. Undefined when the widget falls back to SEED. */
  currentTarget?: number;
}) {
  // Display state
  const [title, setTitle] = useState(currentTitle);
  const [autoSize, setAutoSize] = useState(currentTitleSize === undefined);
  const [size, setSize] = useState(currentTitleSize ?? 32);
  const [align, setAlign] = useState<"left" | "center" | "right">(
    currentTitleAlign ?? "left",
  );

  const [chipEnabled, setChipEnabled] = useState(!!currentChip);
  const [chipText, setChipText] = useState(currentChip?.text ?? "");
  const [chipIcon, setChipIcon] = useState<ChipIconKey>(
    (currentChip?.icon as ChipIconKey | undefined) ?? "none",
  );
  const [chipColor, setChipColor] = useState<ChipColorKey>(
    (currentChip?.color as ChipColorKey | undefined) ?? "neutral",
  );
  const [chipAutoSize, setChipAutoSize] = useState(currentChip?.size === undefined);
  const [chipSize, setChipSize] = useState(currentChip?.size ?? 14);

  // Time period state — undefined means "no override" (clears the field).
  const [timePeriodEnabled, setTimePeriodEnabled] = useState(!!currentTimePeriod);
  const [timePeriod, setTimePeriod] = useState<TimePeriod | undefined>(
    currentTimePeriod,
  );

  // Gauge-only: target value. `undefined` means "use SEED default".
  const [targetEnabled, setTargetEnabled] = useState(currentTarget !== undefined);
  const [target, setTarget] = useState<number>(currentTarget ?? 100_000);

  const [tab, setTab] = useState<"display" | "time">("display");
  const [saving, startSave] = useTransition();

  // Re-hydrate when reopening for a different widget.
  useEffect(() => {
    if (!open) return;
    setTitle(currentTitle);
    setAutoSize(currentTitleSize === undefined);
    setSize(currentTitleSize ?? 32);
    setAlign(currentTitleAlign ?? "left");

    setChipEnabled(!!currentChip);
    setChipText(currentChip?.text ?? "");
    setChipIcon((currentChip?.icon as ChipIconKey | undefined) ?? "none");
    setChipColor((currentChip?.color as ChipColorKey | undefined) ?? "neutral");
    setChipAutoSize(currentChip?.size === undefined);
    setChipSize(currentChip?.size ?? 14);

    setTimePeriodEnabled(!!currentTimePeriod);
    setTimePeriod(currentTimePeriod);

    setTargetEnabled(currentTarget !== undefined);
    setTarget(currentTarget ?? 100_000);

    setTab("display");
  }, [
    open,
    currentTitle,
    currentTitleSize,
    currentTitleAlign,
    currentChip,
    currentTimePeriod,
    currentTarget,
  ]);

  function save() {
    startSave(async () => {
      await updateWidgetDisplay(dashboardId, widgetId, {
        title: title.trim(),
        titleSize: autoSize ? null : size,
        // Persist alignment only when it differs from the implicit default
        // ("left"). Sending `null` for left keeps the saved display blob
        // small for the common case.
        titleAlign: align === "left" ? null : align,
        chip:
          chipEnabled && chipText.trim()
            ? {
                text: chipText.trim(),
                icon: chipIcon === "none" ? null : chipIcon,
                color: chipColor,
                size: chipAutoSize ? null : chipSize,
              }
            : null,
        timePeriod: timePeriodEnabled && timePeriod ? timePeriod : null,
        // Only patch `target` for gauges, and only when the toggle's on.
        // For other widget types we don't surface it at all.
        target:
          widgetType === "gauge"
            ? targetEnabled
              ? target
              : null
            : undefined,
      });
      onOpenChange(false);
    });
  }

  const previewChip: WidgetChip | undefined =
    chipEnabled && chipText.trim()
      ? {
          text: chipText.trim(),
          icon: chipIcon === "none" ? undefined : chipIcon,
          color: chipColor,
          size: chipAutoSize ? undefined : chipSize,
        }
      : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(1, 2, 88, 0.32)",
            backdropFilter: "blur(2px)",
            zIndex: 60,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(560px, 96vw)",
            maxHeight: "92vh",
            overflow: "auto",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            boxShadow: "var(--shadow-lg)",
            padding: 24,
            zIndex: 61,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <Dialog.Title asChild>
              <div className="t-h3">Edit widget</div>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="widget-iconbtn"
                aria-label="Close"
                style={{ width: 32, height: 32 }}
              >
                <Icons.Close size={14} />
              </button>
            </Dialog.Close>
          </div>

          {/* Top-level tabs */}
          <div
            role="tablist"
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              marginBottom: 18,
            }}
          >
            <TabButton active={tab === "display"} onClick={() => setTab("display")}>
              Display
            </TabButton>
            <TabButton active={tab === "time"} onClick={() => setTab("time")}>
              Time period
            </TabButton>
          </div>

          {tab === "display" && (
            <DisplayTab
              title={title}
              setTitle={setTitle}
              autoSize={autoSize}
              setAutoSize={setAutoSize}
              size={size}
              setSize={setSize}
              align={align}
              setAlign={setAlign}
              chipEnabled={chipEnabled}
              setChipEnabled={setChipEnabled}
              chipText={chipText}
              setChipText={setChipText}
              chipIcon={chipIcon}
              setChipIcon={setChipIcon}
              chipColor={chipColor}
              setChipColor={setChipColor}
              chipAutoSize={chipAutoSize}
              setChipAutoSize={setChipAutoSize}
              chipSize={chipSize}
              setChipSize={setChipSize}
              previewChip={previewChip}
              onEnter={save}
              widgetType={widgetType}
              targetEnabled={targetEnabled}
              setTargetEnabled={setTargetEnabled}
              target={target}
              setTarget={setTarget}
            />
          )}

          {tab === "time" && (
            <div>
              <SectionLabel
                style={{ marginBottom: 12 }}
                right={
                  <Checkbox
                    checked={timePeriodEnabled}
                    onChange={(v) => {
                      setTimePeriodEnabled(v);
                      // Seed a sensible default when enabling for the first
                      // time so the picker isn't completely empty.
                      if (v && !timePeriod) {
                        setTimePeriod({ kind: "current", granularity: "month" });
                      }
                    }}
                    label="Override widget time period"
                  />
                }
              >
                Time period
              </SectionLabel>
              <div
                style={{
                  opacity: timePeriodEnabled ? 1 : 0.4,
                  pointerEvents: timePeriodEnabled ? "auto" : "none",
                  transition: "opacity 140ms",
                }}
              >
                <TimePeriodPicker
                  value={
                    timePeriod ?? { kind: "current", granularity: "month" }
                  }
                  onChange={setTimePeriod}
                />
              </div>
              {!timePeriodEnabled && (
                <p
                  className="t-small"
                  style={{
                    color: "var(--text-muted)",
                    marginTop: 12,
                    textAlign: "center",
                  }}
                >
                  This widget will follow the dashboard time period.
                </p>
              )}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 24,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            <Dialog.Close asChild>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={saving}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Display tab body — title + chip controls + live preview.
// Lifted out for readability; props mirror the parent's state setters.
// ─────────────────────────────────────────────────────────────────────────────

function DisplayTab(props: {
  title: string;
  setTitle: (v: string) => void;
  autoSize: boolean;
  setAutoSize: (v: boolean) => void;
  size: number;
  setSize: (v: number) => void;
  align: "left" | "center" | "right";
  setAlign: (v: "left" | "center" | "right") => void;
  chipEnabled: boolean;
  setChipEnabled: (v: boolean) => void;
  chipText: string;
  setChipText: (v: string) => void;
  chipIcon: ChipIconKey;
  setChipIcon: (v: ChipIconKey) => void;
  chipColor: ChipColorKey;
  setChipColor: (v: ChipColorKey) => void;
  chipAutoSize: boolean;
  setChipAutoSize: (v: boolean) => void;
  chipSize: number;
  setChipSize: (v: number) => void;
  previewChip?: WidgetChip;
  onEnter: () => void;
  /** Widget type — surfaces type-specific sections (Gauge → Target). */
  widgetType: string;
  targetEnabled: boolean;
  setTargetEnabled: (v: boolean) => void;
  target: number;
  setTarget: (v: number) => void;
}) {
  const {
    title,
    setTitle,
    autoSize,
    setAutoSize,
    size,
    setSize,
    align,
    setAlign,
    chipEnabled,
    setChipEnabled,
    chipText,
    setChipText,
    chipIcon,
    setChipIcon,
    chipColor,
    setChipColor,
    chipAutoSize,
    setChipAutoSize,
    chipSize,
    setChipSize,
    previewChip,
    onEnter,
    widgetType,
    targetEnabled,
    setTargetEnabled,
    target,
    setTarget,
  } = props;

  return (
    <>
      <SectionLabel>Title</SectionLabel>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="MRR"
        maxLength={80}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        style={textInputStyle}
      />

      <SectionLabel
        style={{ marginTop: 18 }}
        right={
          <Checkbox
            checked={autoSize}
            onChange={setAutoSize}
            label="Auto (scales with widget)"
          />
        }
      >
        Title size
      </SectionLabel>
      <SizeRow
        disabled={autoSize}
        min={12}
        max={96}
        value={size}
        onChange={setSize}
      />

      <SectionLabel style={{ marginTop: 18 }}>Alignment</SectionLabel>
      <div
        role="radiogroup"
        style={{
          display: "inline-flex",
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 2,
          gap: 2,
        }}
      >
        {(["left", "center", "right"] as const).map((a) => {
          const active = align === a;
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setAlign(a)}
              title={`Align ${a}`}
              style={{
                padding: "8px 14px",
                background: active ? "var(--bg)" : "transparent",
                border: "1px solid",
                borderColor: active ? "var(--border-strong)" : "transparent",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                textTransform: "capitalize",
                minWidth: 72,
              }}
            >
              {a}
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <SectionLabel style={{ marginBottom: 0 }}>Chip</SectionLabel>
          <Checkbox
            checked={chipEnabled}
            onChange={setChipEnabled}
            label="Show chip"
          />
        </div>

        <div
          style={{
            opacity: chipEnabled ? 1 : 0.4,
            pointerEvents: chipEnabled ? "auto" : "none",
            transition: "opacity 140ms",
          }}
        >
          <input
            type="text"
            value={chipText}
            onChange={(e) => setChipText(e.target.value)}
            placeholder="Q2"
            maxLength={32}
            style={textInputStyle}
          />

          <SectionLabel style={{ marginTop: 14 }}>Icon</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 6,
            }}
          >
            {(Object.keys(CHIP_ICONS) as ChipIconKey[]).map((key) => {
              const Icon = key === "none" ? null : Icons[key as IconName];
              const active = chipIcon === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChipIcon(key)}
                  title={CHIP_ICONS[key].label}
                  style={{
                    padding: 8,
                    background: active ? "var(--primary-soft)" : "var(--bg-elev-2)",
                    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: 8,
                    color: active ? "var(--primary)" : "var(--text-secondary)",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    minHeight: 36,
                  }}
                >
                  {Icon ? (
                    <Icon size={16} />
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 500 }}>None</span>
                  )}
                </button>
              );
            })}
          </div>

          <SectionLabel style={{ marginTop: 14 }}>Color</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(Object.keys(CHIP_COLORS) as ChipColorKey[]).map((key) => {
              const palette = CHIP_COLORS[key];
              const active = chipColor === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChipColor(key)}
                  title={key}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    background: palette.bg,
                    color: palette.fg,
                    border: `2px solid ${active ? palette.fg : "transparent"}`,
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>

          <SectionLabel
            style={{ marginTop: 14 }}
            right={
              <Checkbox
                checked={chipAutoSize}
                onChange={setChipAutoSize}
                label="Auto"
              />
            }
          >
            Chip size
          </SectionLabel>
          <SizeRow
            disabled={chipAutoSize}
            min={8}
            max={48}
            value={chipSize}
            onChange={setChipSize}
          />
        </div>
      </div>

      {/* Gauge target (gauge widgets only) */}
      {widgetType === "gauge" && (
        <div
          style={{
            marginTop: 22,
            paddingTop: 18,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <SectionLabel style={{ marginBottom: 0 }}>Target</SectionLabel>
            <Checkbox
              checked={targetEnabled}
              onChange={setTargetEnabled}
              label="Override target"
            />
          </div>
          <div
            style={{
              opacity: targetEnabled ? 1 : 0.4,
              pointerEvents: targetEnabled ? "auto" : "none",
              transition: "opacity 140ms",
            }}
          >
            <input
              type="number"
              value={target}
              min={0}
              step={1000}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setTarget(n);
              }}
              placeholder="100000"
              style={textInputStyle}
            />
            <p
              className="t-small"
              style={{ marginTop: 6, color: "var(--text-muted)" }}
            >
              The dial fills proportionally — when the bound value reaches the
              target the gauge sits at 100 %.
            </p>
          </div>
        </div>
      )}

      {/* Preview */}
      <div
        style={{
          marginTop: 22,
          padding: "18px 18px",
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          minHeight: 80,
          display: "flex",
          alignItems: "center",
          gap: 12,
          // Mirror the alignment on the preview so the operator sees
          // exactly what they'll get in the widget.
          justifyContent:
            align === "center"
              ? "center"
              : align === "right"
                ? "flex-end"
                : "flex-start",
        }}
      >
        <span
          style={{
            color: "var(--text-primary)",
            fontWeight: 500,
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
            fontSize: autoSize ? 24 : size,
            textAlign: align,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {title.trim() || (
            <span style={{ color: "var(--text-muted)" }}>Enter a title…</span>
          )}
        </span>
        {previewChip ? <PreviewChip chip={previewChip} /> : null}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────

const textInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg-elev-2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  color: "var(--text-primary)",
  outline: "none",
};

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "10px 14px",
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--primary)" : "transparent"}`,
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        fontWeight: active ? 500 : 400,
        fontSize: 14,
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function SectionLabel({
  children,
  right,
  style,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 6,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        }}
      >
        {children}
      </span>
      {right}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-secondary)",
        cursor: "pointer",
        textTransform: "none",
        letterSpacing: 0,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--primary)" }}
      />
      {label}
    </label>
  );
}

function SizeRow({
  disabled,
  min,
  max,
  value,
  onChange,
}: {
  disabled: boolean;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
        transition: "opacity 140ms",
      }}
    >
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "var(--primary)" }}
      />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        style={{
          width: 72,
          padding: "8px 10px",
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 14,
          color: "var(--text-primary)",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      />
      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        px
      </span>
    </div>
  );
}

function PreviewChip({ chip }: { chip: WidgetChip }) {
  const palette = CHIP_COLORS[chip.color ?? "neutral"];
  const Icon =
    chip.icon && chip.icon !== "none"
      ? (Icons[chip.icon as IconName] ?? null)
      : null;
  const iconSize = chip.size ? Math.max(10, Math.round(chip.size * 0.75)) : 14;
  return (
    <span
      className="widget-chip"
      style={
        {
          "--chip-bg": palette.bg,
          "--chip-fg": palette.fg,
          fontSize: chip.size ? `${chip.size}px` : 14,
        } as React.CSSProperties
      }
    >
      {Icon ? <Icon size={iconSize} /> : null}
      <span className="widget-chip-text">{chip.text}</span>
    </span>
  );
}
