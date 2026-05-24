"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createQueryAction,
  previewQueryAction,
  updateQueryAction,
} from "@/lib/queries/actions";
import {
  DATE_RANGES,
  FILTER_OPS,
  FILTER_OP_LABEL,
  OUTPUT_FORMATS,
  OUTPUT_FORMAT_LABEL,
  SOURCES,
  opIsMultiValue,
  opIsUnary,
  type ConditionalColors,
  type DateRange,
  type Filter,
  type FilterOp,
  type OutputFormat,
  type Source,
} from "@/lib/queries/ast";
import {
  AGGREGATION_LABEL,
  CLIENT_METRIC_INDEX,
  WIZARD_AGGREGATIONS,
  dateFieldsForSource,
  fieldsForSource,
  findMetricId,
  type FieldType,
  type WizardAggregation,
} from "@/lib/queries/catalog";
import { Icons } from "@/components/ui/Icon";

/**
 * Query wizard — Plecto-style 7-step ordered form.
 *
 *   1. Name
 *   2. Data source
 *   3. Function (aggregation + field)
 *   4. Filters (property + operator + value)
 *   5. Date field
 *   6. Output format
 *   7. Conditional colors
 *
 * Step 4 supports the full operator menu: is / is not / is any of /
 * is none of / is at least / is at most / is known / is unknown. The
 * unary operators (`known` / `unknown`) hide the value field.
 *
 * Steps 6 + 7 (output format, conditional colors) are stored on the
 * saved `QueryConfig` today — widget rendering picks them up next.
 *
 * Result shape is always `single` here; bar/funnel/ranking widgets will
 * grow their own composer in a follow-up.
 */
/**
 * The page passes `metrics` for legacy reasons; we don't read it — the
 * new wizard reads `SOURCE_FIELDS` directly to talk in agg + field
 * tuples instead of pre-composed metric ids.
 *
 * `allowedFieldsBySource` narrows the field menus per source: when set
 * for a source (e.g. HubSpot), the wizard intersects SOURCE_FIELDS with
 * the operator's selection from /integrations. `undefined` means "no
 * narrowing" (Stripe today, or HubSpot when not connected).
 */
export function QueryWizard({
  allowedFieldsBySource,
  customFieldsBySource,
  standardEnumOptionsBySource,
  initial,
}: {
  metrics: unknown;
  allowedFieldsBySource?: Partial<Record<Source, string[] | undefined>>;
  /**
   * Custom HubSpot / Stripe fields the operator picked at /integrations.
   * Surfaced in the Filters step; field id is `custom:<propName>`, which
   * the executor's compileFilter translates to a json_extract(...) on
   * the source's `custom_properties` column.
   */
  customFieldsBySource?: Partial<
    Record<
      Source,
      Array<{
        id: string;
        label: string;
        type: string;
        /** Enum options when type === "enumeration". */
        options?: Array<{ label: string; value: string }>;
      }>
    >
  >;
  /**
   * Live enum options for **standard** fields keyed by internal field id
   * (e.g. `pipeline`, `stage`, `lifecycleStage`). These come from the
   * operator's /integrations selection and override anything hardcoded
   * in SOURCE_FIELDS so the filter value picker shows real pipeline
   * IDs with human labels.
   */
  standardEnumOptionsBySource?: Partial<
    Record<Source, Record<string, Array<{ label: string; value: string }>>>
  >;
  /**
   * When provided, the wizard runs in **edit** mode — fields hydrate from
   * the existing query and Save dispatches to `updateQueryAction(id, …)`.
   * Otherwise (`undefined`), the wizard creates a new query.
   */
  initial?: {
    id: string;
    name: string;
    config: import("@/lib/queries/ast").QueryConfig;
  };
}) {
  const router = useRouter();
  const allowedFor = (s: Source) => allowedFieldsBySource?.[s];
  const customFor = (s: Source) => customFieldsBySource?.[s] ?? [];
  const standardEnumFor = (s: Source) =>
    standardEnumOptionsBySource?.[s] ?? {};

  // Derive initial wizard state from the saved config. Synthetic
  // `__custom:` metric ids decompose back into (aggregation, fieldId)
  // so the form re-renders the same combobox selection the operator
  // saved last time.
  const initialDerived = useMemo(() => deriveFromConfig(initial?.config), [initial]);

  // ─── Step 1
  const [name, setName] = useState(initial?.name ?? "");

  // ─── Step 2
  const [source, setSource] = useState<Source>(
    (initial?.config?.source as Source | undefined) ?? "stripe",
  );

  // ─── Step 3
  const [aggregation, setAggregation] = useState<WizardAggregation>(
    initialDerived?.aggregation ?? "sum",
  );
  const availableFields = useMemo(() => {
    const types: FieldType[] =
      aggregation === "count" ? ["count"] : ["currency", "numeric"];
    const all = fieldsForSource(source, types);
    const allow = allowedFor(source);
    const standard = allow ? all.filter((f) => allow.includes(f.id)) : all;

    // For numeric aggregations (sum/avg/min/max), surface the operator's
    // picked custom NUMERIC fields. The wizard mints a virtual field id
    // — the save path translates it to a synthetic metric id the
    // executor resolves via `buildCustomMetric`.
    if (aggregation !== "count") {
      const customNumeric = (customFor(source) ?? [])
        .filter((c) => c.type === "number")
        .map((c) => ({
          id: c.id,
          source,
          label: c.label,
          type: "numeric" as const,
        }));
      return [...standard, ...customNumeric];
    }
    return standard;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, aggregation, allowedFieldsBySource, customFieldsBySource]);
  const [fieldId, setFieldId] = useState<string>(
    initialDerived?.fieldId ?? availableFields[0]?.id ?? "amount",
  );
  // Keep fieldId valid when source/aggregation changes.
  useMemo(() => {
    if (!availableFields.find((f) => f.id === fieldId)) {
      setFieldId(availableFields[0]?.id ?? "amount");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, aggregation]);

  // ─── Step 4
  const [filters, setFilters] = useState<Filter[]>(
    initial?.config?.filters ?? [],
  );

  // ─── Step 5
  // Date field menu = standard date columns + operator's picked custom
  // datetime fields. The executor's `resolveDateColumn` recognises the
  // `custom:` prefix and json_extracts on `custom_properties`.
  const dateFieldOptions = useMemo(() => {
    const standard = dateFieldsForSource(source);
    const customDates = (customFor(source) ?? [])
      .filter((c) => c.type === "datetime" || c.type === "date")
      .map((c) => ({ id: c.id, source, label: c.label }));
    return [...standard, ...customDates];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, customFieldsBySource]);
  const [dateField, setDateField] = useState<string>(
    initial?.config?.dateField ?? dateFieldOptions[0]?.id ?? "",
  );
  useMemo(() => {
    if (!dateFieldOptions.find((d) => d.id === dateField)) {
      setDateField(dateFieldOptions[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);
  const [dateRange, setDateRange] = useState<DateRange>(
    initial?.config?.dateRange ?? "this-month",
  );

  // ─── Step 6
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(
    initial?.config?.outputFormat ?? "currency",
  );

  // ─── Step 7
  const [colorsEnabled, setColorsEnabled] = useState(
    !!initial?.config?.conditionalColors,
  );
  const [colors, setColors] = useState<ConditionalColors>(
    initial?.config?.conditionalColors ?? {
      colors: ["#E53935", "#FBBF24", "#22C55E"],
      thresholds: [50, 100],
    },
  );

  // Save / preview state
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ summary?: string; value?: number | null } | null>(null);
  const [saving, startSave] = useTransition();
  const [previewing, startPreview] = useTransition();

  function buildConfig() {
    // Custom-field path: the field is a virtual `custom:<propName>`
    // selection from /integrations. Mint a synthetic metric id the
    // executor resolves via `buildCustomMetric`.
    //
    //   `__custom:<source>:<object>:<aggregation>:<propName>`
    //
    // Today every custom HubSpot pick is keyed under deals OR contacts
    // by where it was selected in the integration UI — we infer the
    // object from the field's `id` (the buildCustomFields helper in
    // /queries/new prefixes labels with "Deal · " / "Contact · " but
    // for the id we look at the source's selected fields).
    let metricId: string | null = null;
    if (fieldId.startsWith("custom:")) {
      const propName = fieldId.slice("custom:".length);
      const customs = customFor(source) ?? [];
      const c = customs.find((x) => x.id === fieldId);
      // The label is prefixed "Deal · " or "Contact · " by the page.
      const object =
        c?.label?.startsWith("Contact") ? "contacts" : "deals";
      metricId = `__custom:${source}:${object}:${aggregation}:${propName}`;
    } else {
      metricId = findMetricId(source, aggregation, fieldId);
    }
    if (!metricId) {
      throw new Error(
        `No metric registered for ${aggregation} of ${fieldId} on ${source}. Pick a different field.`,
      );
    }
    return {
      kind: "single" as const,
      source,
      metric: metricId,
      filters,
      dateRange,
      dateField: dateField || undefined,
      outputFormat,
      conditionalColors: colorsEnabled ? colors : undefined,
    };
  }

  function runPreview() {
    setError(null);
    setPreview(null);
    try {
      const config = buildConfig();
      startPreview(async () => {
        const res = await previewQueryAction(config);
        if (!res.ok) {
          setError(res.error);
        } else if (res.kind === "single") {
          setPreview({ summary: res.formatted ?? "—", value: res.value });
        } else if (res.kind === "timeseries") {
          setPreview({
            summary: `${res.points.length} points`,
            value: null,
          });
        } else {
          setPreview({ summary: `${res.rows.length} rows`, value: null });
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function save() {
    setError(null);
    try {
      const config = buildConfig();
      const finalName = name.trim() || "Untitled query";
      startSave(async () => {
        const res = initial
          ? await updateQueryAction({ id: initial.id, name: finalName, config })
          : await createQueryAction({ name: finalName, config });
        if (!res.ok) setError(res.error);
        else router.push(`/queries`);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ maxWidth: 720, padding: "12px 8px" }}>
      <Step n={1} title="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. MRR this quarter"
          maxLength={120}
          style={inputStyle}
        />
      </Step>

      <Step n={2} title="Data source">
        <Segmented
          value={source}
          options={SOURCES.map((s) => ({
            value: s,
            label: s === "stripe" ? "Stripe" : "HubSpot",
          }))}
          onChange={setSource}
        />
      </Step>

      <Step n={3} title="Function">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <select
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value as WizardAggregation)}
            style={selectStyle}
          >
            {WIZARD_AGGREGATIONS.map((a) => (
              <option key={a} value={a}>
                {AGGREGATION_LABEL[a]}
              </option>
            ))}
          </select>
          <select
            value={fieldId}
            onChange={(e) => setFieldId(e.target.value)}
            style={selectStyle}
          >
            {availableFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
            {availableFields.length === 0 && (
              <option value="">No fields for this aggregation</option>
            )}
          </select>
        </div>
      </Step>

      <Step n={4} title="Filters">
        <FiltersEditor
          source={source}
          filters={filters}
          onChange={setFilters}
          allowedFields={allowedFor(source)}
          customFields={customFor(source)}
          standardEnumOptions={standardEnumFor(source)}
        />
      </Step>

      <Step n={5} title="Date field">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            style={selectStyle}
          >
            {dateFieldOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            style={selectStyle}
          >
            {DATE_RANGES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </Step>

      <Step n={6} title="Output format">
        <Segmented
          value={outputFormat}
          options={OUTPUT_FORMATS.map((o) => ({
            value: o,
            label: OUTPUT_FORMAT_LABEL[o],
          }))}
          onChange={setOutputFormat}
        />
      </Step>

      <Step n={7} title="Conditional colors">
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 10,
          }}
        >
          <input
            type="checkbox"
            checked={colorsEnabled}
            onChange={(e) => setColorsEnabled(e.target.checked)}
            style={{ accentColor: "var(--primary)" }}
          />
          Use conditional colors
        </label>
        <div
          style={{
            opacity: colorsEnabled ? 1 : 0.45,
            pointerEvents: colorsEnabled ? "auto" : "none",
            transition: "opacity 140ms",
          }}
        >
          <ConditionalColorsEditor value={colors} onChange={setColors} />
        </div>
      </Step>

      {/* Preview + actions */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 18,
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={runPreview}
          disabled={previewing}
        >
          {previewing ? "Running…" : "Preview"}
        </button>
        {preview && (
          <span
            className="t-mono"
            style={{ color: "var(--text-primary)", fontWeight: 500 }}
          >
            {preview.summary}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Save query"}
        </button>
      </div>

      {error && (
        <p
          className="t-small"
          style={{
            marginTop: 14,
            color: "var(--danger)",
            background: "var(--danger-soft)",
            padding: "10px 12px",
            borderRadius: 8,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step shell
// ─────────────────────────────────────────────────────────────────────────────

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: 22,
        paddingBottom: 22,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span
          className="t-mono"
          style={{
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.04em",
          }}
        >
          0{n}
        </span>
        <h2
          className="t-h4"
          style={{ margin: 0, fontWeight: 500, color: "var(--text-primary)" }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

function FiltersEditor({
  source,
  filters,
  onChange,
  allowedFields,
  customFields,
  standardEnumOptions,
}: {
  source: Source;
  filters: Filter[];
  onChange: (next: Filter[]) => void;
  /** Field-id allow-list from the parent (operator's /integrations selection). */
  allowedFields?: string[];
  /** Custom (JSON-backed) fields, surfaced inline with the standard ones. */
  customFields?: Array<{
    id: string;
    label: string;
    type: string;
    options?: Array<{ label: string; value: string }>;
  }>;
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
    const all = fieldsForSource(source);
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
    const customAsFields = (customFields ?? []).map((c) => ({
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
  }, [source, allowedFields, customFields]);

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
        style={{ alignSelf: "flex-start", marginTop: 4 }}
      >
        <Icons.Plus size={14} /> Add filter
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditional colors editor
// ─────────────────────────────────────────────────────────────────────────────

function ConditionalColorsEditor({
  value,
  onChange,
}: {
  value: ConditionalColors;
  onChange: (next: ConditionalColors) => void;
}) {
  function updateColor(i: 0 | 1 | 2, hex: string) {
    const next = [...value.colors] as [string, string, string];
    next[i] = hex;
    onChange({ ...value, colors: next });
  }
  function updateThreshold(i: 0 | 1, v: number) {
    const next = [...value.thresholds] as [number, number];
    next[i] = v;
    // Keep monotonic — thresholds[1] >= thresholds[0].
    if (i === 0 && next[1] < v) next[1] = v;
    if (i === 1 && next[0] > v) next[0] = v;
    onChange({ ...value, thresholds: next });
  }
  const [c0, c1, c2] = value.colors;
  const [t0, t1] = value.thresholds;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      <ColorStop
        color={c0}
        onColor={(v) => updateColor(0, v)}
        label="Below"
        suffix={`≤ ${t0}%`}
        threshold={t0}
        onThreshold={(v) => updateThreshold(0, v)}
      />
      <ColorStop
        color={c1}
        onColor={(v) => updateColor(1, v)}
        label="Middle"
        suffix={`${t0}–${t1}%`}
        threshold={t1}
        onThreshold={(v) => updateThreshold(1, v)}
      />
      <ColorStop
        color={c2}
        onColor={(v) => updateColor(2, v)}
        label="Above"
        suffix={`> ${t1}%`}
      />
    </div>
  );
}

function ColorStop({
  color,
  onColor,
  label,
  suffix,
  threshold,
  onThreshold,
}: {
  color: string;
  onColor: (v: string) => void;
  label: string;
  suffix: string;
  threshold?: number;
  onThreshold?: (v: number) => void;
}) {
  return (
    <div
      style={{
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{label}</span>
        <span
          className="t-mono"
          style={{ fontSize: 11, color: "var(--text-muted)" }}
        >
          {suffix}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={color}
          onChange={(e) => onColor(e.target.value)}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "transparent",
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={color}
          onChange={(e) => onColor(e.target.value)}
          style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
        />
      </div>
      {onThreshold !== undefined && threshold !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number"
            min={0}
            max={200}
            value={threshold}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onThreshold(n);
            }}
            style={{ ...inputStyle, textAlign: "right", width: 72 }}
          />
          <span
            style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            %
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style + a tiny segmented control
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Invert the save-time encoding to hydrate the wizard on edit:
 *
 *  - `metric: "stripe.charge.sum_amount"` → { aggregation: "sum", fieldId: "amount" }
 *  - `metric: "__custom:hubspot:deals:sum:annual_recurring_revenue"`
 *      → { aggregation: "sum", fieldId: "custom:annual_recurring_revenue" }
 *
 * Falls back to defaults when the saved metric isn't in our catalog
 * (which shouldn't happen, but keeps the form usable instead of throwing).
 */
function deriveFromConfig(
  config: import("@/lib/queries/ast").QueryConfig | undefined,
): { aggregation: WizardAggregation; fieldId: string } | null {
  if (!config) return null;
  const metricId = config.metric;

  if (metricId.startsWith("__custom:")) {
    const [, , , agg, ...rest] = metricId.split(":");
    const fieldName = rest.join(":");
    if (
      (agg === "sum" || agg === "avg" || agg === "min" || agg === "max" || agg === "count") &&
      fieldName
    ) {
      return {
        aggregation: agg as WizardAggregation,
        fieldId: `custom:${fieldName}`,
      };
    }
  }

  // Standard metric — reverse-lookup in the catalog.
  const standard = clientMetricById(metricId);
  if (standard) {
    return { aggregation: standard.aggregation, fieldId: standard.fieldId };
  }
  return null;
}

/** Tiny synchronous lookup over METRICS to find agg + field for a given id. */
function clientMetricById(
  id: string,
): { aggregation: WizardAggregation; fieldId: string } | null {
  // Hard-code the inverse of metrics.ts. Importing the server-only METRICS
  // map is fine here because it's pure data — no Drizzle table refs reach
  // the client bundle through `CLIENT_METRICS`. (And we only read `unit`
  // / `id` style fields here.)
  for (const m of CLIENT_METRIC_INDEX) {
    if (m.id === id) {
      return { aggregation: m.aggregation, fieldId: m.column };
    }
  }
  return null;
}

/**
 * Compact multi-value picker for `is any of` / `is none of` on enum fields.
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

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
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
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
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
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
