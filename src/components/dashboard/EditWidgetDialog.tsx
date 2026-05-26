"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icons, type IconName } from "@/components/ui/Icon";
import { updateWidgetDisplay } from "@/lib/dashboards";
import {
  getWidgetFilterContext,
  listQueriesForPicker,
} from "@/lib/queries/actions";
import { objectFromMetricId } from "@/lib/queries/catalog";
import { FiltersEditor } from "@/components/queries/FiltersEditor";
import type { Filter } from "@/lib/queries/ast";
import {
  CHIP_COLORS,
  CHIP_ICONS,
  type ChipColorKey,
  type ChipIconKey,
  type WidgetChip,
} from "./widgetChip";
import { TimePeriodPicker } from "./TimePeriodPicker";
import type { TimePeriod } from "@/lib/timePeriod";

/** Funnel stage row — `queryId === null` means the operator hasn't picked one yet. */
type StageRow = { id: string; label: string; queryId: string | null };

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
  currentStages,
  currentFilters,
  boundQuerySource,
  boundQueryMetric,
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
  /** Funnel-only: stored stages with their per-stage query bindings. */
  currentStages?: StageRow[];
  /** Per-widget filter overlay (AND'd with the query's own filters). */
  currentFilters?: Filter[];
  /**
   * Source/metric of the bound query. Used by the Filters tab to scope
   * the field menu (HubSpot deals vs contacts, Stripe charges). When
   * undefined the widget isn't bound and the Filters tab tells the
   * operator to bind a query first.
   */
  boundQuerySource?: "stripe" | "hubspot";
  boundQueryMetric?: string;
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

  // Funnel stages — keyed locally with crypto.randomUUID so React's
  // reconciliation tracks reorders cleanly while the operator drags
  // rows around. Server normalises ids on save.
  const isFunnel = widgetType === "funnel";
  const [stages, setStages] = useState<StageRow[]>(currentStages ?? []);

  // Per-widget filter overlay state. The filter editor is only useful
  // when the widget is bound to a real query — boundQuerySource gives
  // us the source/object scoping the field menu needs.
  const [filters, setFilters] = useState<Filter[]>(currentFilters ?? []);

  const [tab, setTab] = useState<
    "display" | "time" | "filters" | "stages"
  >("display");
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

    setStages(currentStages ?? []);
    setFilters(currentFilters ?? []);

    setTab("display");
  }, [
    open,
    currentTitle,
    currentTitleSize,
    currentTitleAlign,
    currentChip,
    currentTimePeriod,
    currentTarget,
    currentStages,
    currentFilters,
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
        // Target is meaningful for gauges (fills the dial) and for
        // SingleValue tiles (anchor for the query's conditionalColors).
        // For everything else we leave the field untouched.
        target:
          widgetType === "gauge" || widgetType === "singleValue"
            ? targetEnabled
              ? target
              : null
            : undefined,
        // Funnel-only — persist the configured stages. For other
        // widget types we never touch the field so the server keeps
        // whatever's already stored (typically nothing).
        stages: isFunnel
          ? stages.length > 0
            ? stages
            : null
          : undefined,
        // Widget-level filter overlay. `null` clears it; an empty
        // array also clears it server-side.
        filters: filters.length > 0 ? filters : null,
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
            <TabButton active={tab === "filters"} onClick={() => setTab("filters")}>
              Filters
            </TabButton>
            {isFunnel && (
              <TabButton active={tab === "stages"} onClick={() => setTab("stages")}>
                Funnel stages
              </TabButton>
            )}
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

          {tab === "stages" && isFunnel && (
            <FunnelStagesTab stages={stages} onChange={setStages} />
          )}

          {tab === "filters" && (
            <WidgetFiltersTab
              filters={filters}
              onChange={setFilters}
              source={boundQuerySource}
              metric={boundQueryMetric}
              isFunnel={isFunnel}
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

      {/* Target — gauges + SingleValue tiles.
          For gauges it drives the dial fill.
          For SingleValue it's the anchor for the bound query's
          `conditionalColors` percentage thresholds. */}
      {(widgetType === "gauge" || widgetType === "singleValue") && (
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
              {widgetType === "gauge"
                ? "The dial fills proportionally — when the bound value reaches the target the gauge sits at 100 %."
                : "Anchors the query's conditional colors: % of target picks the red / yellow / green stop."}
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
// Filters tab — per-widget filter overlay.
//
// AND'd with the bound query's own filters at execute time. Lets one
// saved query power many widgets with different scopes. Lazy-loads the
// HubSpot filter context (custom fields + live enum options) so the
// dialog opens snappy for non-filter use cases.
// ─────────────────────────────────────────────────────────────────────────────

type FilterContext = Awaited<ReturnType<typeof getWidgetFilterContext>>;

function WidgetFiltersTab({
  filters,
  onChange,
  source,
  metric,
  isFunnel,
}: {
  filters: Filter[];
  onChange: (next: Filter[]) => void;
  source: "stripe" | "hubspot" | undefined;
  metric: string | undefined;
  isFunnel: boolean;
}) {
  const [ctx, setCtx] = useState<FilterContext | null>(null);

  // Lazy-load filter context (custom HubSpot fields + live enum
  // options) on first paint of this tab. Same pattern as the
  // FunnelStagesTab query list.
  useEffect(() => {
    let alive = true;
    if (source === "hubspot") {
      getWidgetFilterContext()
        .then((v) => {
          if (alive) setCtx(v);
        })
        .catch(() => {
          if (alive)
            setCtx({
              hubspotAllowed: undefined,
              hubspotCustomFields: [],
              hubspotEnumOverrides: {},
            });
        });
    } else {
      // Stripe (and unbound) need no async context — the standard
      // SOURCE_FIELDS catalogue covers everything filterable.
      setCtx({
        hubspotAllowed: undefined,
        hubspotCustomFields: [],
        hubspotEnumOverrides: {},
      });
    }
    return () => {
      alive = false;
    };
  }, [source]);

  // Without a bound query we can't scope the field menu — tell the
  // operator to bind one first instead of showing a useless picker.
  if (!source || !metric) {
    return (
      <div>
        <SectionLabel style={{ marginBottom: 12 }}>Filters</SectionLabel>
        <p
          className="t-small"
          style={{
            padding: "12px 14px",
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          {isFunnel
            ? "Filters apply to every funnel stage. Bind at least one stage first so we know which fields are available."
            : "Bind a query first — filters refine the data the widget already pulls."}
        </p>
      </div>
    );
  }

  const object = objectFromMetricId(source, metric);

  return (
    <div>
      <SectionLabel
        style={{ marginBottom: 12 }}
        right={
          <span className="t-small" style={{ color: "var(--text-muted)" }}>
            {filters.length} filter{filters.length === 1 ? "" : "s"}
          </span>
        }
      >
        Filters
      </SectionLabel>
      <p
        className="t-small"
        style={{
          color: "var(--text-muted)",
          margin: "0 0 14px",
          lineHeight: 1.5,
        }}
      >
        Layered on top of the bound query&apos;s own filters.{" "}
        {isFunnel
          ? "Applied to every funnel stage so the whole pipeline gets scoped together."
          : "One query, many widgets — point each widget at a different slice."}
      </p>
      {ctx === null ? (
        <p
          className="t-small"
          style={{ color: "var(--text-muted)", margin: 0 }}
        >
          Loading filter options…
        </p>
      ) : (
        <FiltersEditor
          source={source}
          object={object}
          filters={filters}
          onChange={onChange}
          allowedFields={ctx.hubspotAllowed}
          customFields={ctx.hubspotCustomFields}
          standardEnumOptions={ctx.hubspotEnumOverrides}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Funnel stages tab — list of (label, queryId) rows.
//
// Stages run as parallel queries server-side; this UI just configures
// them. Only `single` queries are bindable per stage (a funnel needs
// one number per row, not a timeseries or a top-N).
// ─────────────────────────────────────────────────────────────────────────────

type StagePickerRow = Awaited<ReturnType<typeof listQueriesForPicker>>[number];

function FunnelStagesTab({
  stages,
  onChange,
}: {
  stages: StageRow[];
  onChange: (next: StageRow[]) => void;
}) {
  const [queries, setQueries] = useState<StagePickerRow[] | null>(null);

  // Lazy-load the picker list on first render of this tab so the
  // dialog opens snappily for non-funnel widgets without paying the
  // round-trip cost.
  useEffect(() => {
    let alive = true;
    listQueriesForPicker()
      .then((rows) => {
        if (alive) setQueries(rows);
      })
      .catch(() => {
        if (alive) setQueries([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const singleQueries = (queries ?? []).filter((q) => q.kind === "single");

  function addStage() {
    onChange([
      ...stages,
      {
        id: crypto.randomUUID(),
        label: `Stage ${stages.length + 1}`,
        queryId: null,
      },
    ]);
  }

  function updateAt(idx: number, patch: Partial<StageRow>) {
    onChange(stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeAt(idx: number) {
    onChange(stages.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div>
      <SectionLabel
        style={{ marginBottom: 12 }}
        right={
          <span className="t-small" style={{ color: "var(--text-muted)" }}>
            {stages.length} stage{stages.length === 1 ? "" : "s"}
          </span>
        }
      >
        Stages
      </SectionLabel>

      {stages.length === 0 && (
        <p
          className="t-small"
          style={{ color: "var(--text-muted)", marginBottom: 12 }}
        >
          A funnel needs at least one stage. Each stage takes its value
          from a saved <strong>single value</strong> query — e.g.{" "}
          <em>“Leads created this quarter”</em>,{" "}
          <em>“Closed-won deals”</em>.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {stages.map((s, idx) => (
          <div
            key={s.id}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr 1.4fr auto auto",
              gap: 8,
              alignItems: "center",
              padding: 10,
              background: "var(--bg-elev-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <span
              className="t-mono"
              style={{
                width: 22,
                height: 22,
                display: "grid",
                placeItems: "center",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
                color: "var(--text-tertiary)",
              }}
              aria-label={`Stage ${idx + 1}`}
            >
              {idx + 1}
            </span>
            <input
              type="text"
              value={s.label}
              onChange={(e) => updateAt(idx, { label: e.target.value })}
              placeholder="e.g. Leads"
              maxLength={40}
              style={{
                ...textInputStyle,
                padding: "8px 10px",
                fontSize: 13,
              }}
            />
            <select
              value={s.queryId ?? ""}
              onChange={(e) =>
                updateAt(idx, { queryId: e.target.value || null })
              }
              style={{
                ...textInputStyle,
                padding: "8px 10px",
                fontSize: 13,
                appearance: "none",
              }}
            >
              <option value="">— No query (renders 0) —</option>
              {queries === null && (
                <option value="" disabled>
                  Loading queries…
                </option>
              )}
              {singleQueries.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button
                type="button"
                className="widget-iconbtn"
                aria-label="Move stage up"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                style={{
                  width: 22,
                  height: 22,
                  opacity: idx === 0 ? 0.3 : 1,
                  cursor: idx === 0 ? "not-allowed" : "pointer",
                }}
              >
                <Icons.ArrowUp size={11} />
              </button>
              <button
                type="button"
                className="widget-iconbtn"
                aria-label="Move stage down"
                onClick={() => move(idx, 1)}
                disabled={idx === stages.length - 1}
                style={{
                  width: 22,
                  height: 22,
                  opacity: idx === stages.length - 1 ? 0.3 : 1,
                  cursor:
                    idx === stages.length - 1 ? "not-allowed" : "pointer",
                }}
              >
                <Icons.ArrowDown size={11} />
              </button>
            </div>
            <button
              type="button"
              className="widget-iconbtn"
              aria-label={`Remove stage ${s.label}`}
              onClick={() => removeAt(idx)}
              style={{ width: 30, height: 30 }}
            >
              <Icons.Close size={12} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={addStage}
        disabled={stages.length >= 12}
        title={
          stages.length >= 12
            ? "A funnel can have at most 12 stages."
            : "Add another stage"
        }
        style={{ alignSelf: "flex-start", marginTop: 12 }}
      >
        <Icons.Plus size={14} /> Add stage
      </button>

      {queries !== null && singleQueries.length === 0 && (
        <p
          className="t-small"
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--text-muted)",
          }}
        >
          You don&apos;t have any single-value queries yet. Build one
          from <strong>/queries/new</strong> (the default shape in the
          wizard), then come back here to wire it to a stage.
        </p>
      )}
    </div>
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
