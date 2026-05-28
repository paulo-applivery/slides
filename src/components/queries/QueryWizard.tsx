"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createQueryAction,
  previewQueryAction,
  updateQueryAction,
} from "@/lib/queries/actions";
import {
  BUCKETS,
  DATE_RANGES,
  OUTPUT_FORMATS,
  OUTPUT_FORMAT_LABEL,
  SOURCES,
  type Bucket,
  type ConditionalColors,
  type DateRange,
  type Filter,
  type OutputFormat,
  type QueryConfig,
  type QueryKind,
  type Source,
} from "@/lib/queries/ast";
import {
  AGGREGATION_LABEL,
  CLIENT_METRICS,
  CLIENT_METRIC_INDEX,
  WIZARD_AGGREGATIONS,
  dateFieldsForSource,
  fieldsForSource,
  findMetricId,
  objectFromMetricId,
  type FieldType,
  type HubspotObject,
  type SourceObject,
  type WizardAggregation,
} from "@/lib/queries/catalog";
import { FiltersEditor } from "./FiltersEditor";
import { toast } from "@/lib/toast";

/**
 * Query wizard — Plecto-style 8-step ordered form.
 *
 *   1. Name
 *   2. Data source
 *   3. Function (aggregation + field)
 *   4. Show as (shape — single / timeseries / top-N)
 *   5. Filters (property + operator + value)
 *   6. Date field
 *   7. Output format
 *   8. Conditional colors
 *
 * Step 4 picks the result shape. "Single value" is the default;
 * "Over time" produces a `timeseries` query (with a day/week/month
 * bucket + optional previous-period compare) consumable by Bar
 * widgets; "Top N by …" produces a `groupby` query consumable by
 * Ranking widgets. The group-by menu is sourced from
 * `metricGroupByOptions` for the resolved metric — Stripe lets you
 * group by customer/currency/status, HubSpot deals by owner/stage/
 * pipeline, etc.
 *
 * Step 5 supports the full operator menu: is / is not / is any of /
 * is none of / is at least / is at most / is known / is unknown. The
 * unary operators (`known` / `unknown`) hide the value field.
 *
 * Steps 7 + 8 (output format, conditional colors) are honoured at
 * render time for Single / Gauge / Bar / Ranking widgets.
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

  // ─── Step 2b — HubSpot object (deals vs contacts).
  // Stripe has only one object (charges), so the picker hides for it
  // and the resolved object stays "charges" implicitly. HubSpot needs
  // an explicit choice — without it, `findMetricId("hubspot",
  // "count", "count")` always resolved to deals (first match in
  // METRICS) and `hubspot.contact.count` was unreachable from /queries/new.
  const [hubspotObject, setHubspotObject] = useState<HubspotObject>(() => {
    if (initial?.config && initial.config.source === "hubspot") {
      const o = objectFromMetricId("hubspot", initial.config.metric);
      return o === "contacts" ? "contacts" : "deals";
    }
    return "deals";
  });
  const resolvedObject: SourceObject =
    source === "hubspot" ? hubspotObject : "charges";

  // ─── Step 3
  const [aggregation, setAggregation] = useState<WizardAggregation>(
    initialDerived?.aggregation ?? "sum",
  );
  const availableFields = useMemo(() => {
    const types: FieldType[] =
      aggregation === "count" ? ["count"] : ["currency", "numeric"];
    // Narrow by source AND object so the deal field list doesn't leak
    // into a Contacts query (e.g. "Deal amount (€)" would show up
    // even though the contacts table has no amount column).
    const all = fieldsForSource(source, types, resolvedObject);
    const allow = allowedFor(source);
    const standard = allow ? all.filter((f) => allow.includes(f.id)) : all;

    // For numeric aggregations (sum/avg/min/max), surface the operator's
    // picked custom NUMERIC fields. The wizard mints a virtual field id
    // — the save path translates it to a synthetic metric id the
    // executor resolves via `buildCustomMetric`.
    if (aggregation !== "count") {
      const customNumeric = (customFor(source) ?? [])
        // Custom HubSpot fields are labelled "Deal · X" or
        // "Contact · X" by /queries/new — match the picked object so
        // a deal-only custom amount doesn't appear in the Contacts
        // field menu and vice versa.
        .filter((c) => {
          if (c.type !== "number") return false;
          if (source !== "hubspot") return true;
          const isContact = c.label?.startsWith("Contact");
          return resolvedObject === "contacts" ? isContact : !isContact;
        })
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
  }, [source, resolvedObject, aggregation, allowedFieldsBySource, customFieldsBySource]);
  const [fieldId, setFieldId] = useState<string>(
    initialDerived?.fieldId ?? availableFields[0]?.id ?? "amount",
  );
  // Keep fieldId valid when source/aggregation/object changes.
  useMemo(() => {
    if (!availableFields.find((f) => f.id === fieldId)) {
      setFieldId(availableFields[0]?.id ?? "amount");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, resolvedObject, aggregation]);

  // ─── Step 4 — Shape
  // Default to "single" so the existing flow (the most common case) stays
  // a one-click pick. Over-time and Top-N reveal their own sub-controls.
  const [shape, setShape] = useState<QueryKind>(
    initial?.config?.kind ?? "single",
  );
  const [bucket, setBucket] = useState<Bucket>(
    initial?.config?.kind === "timeseries" ? initial.config.bucket : "day",
  );
  const [comparePrev, setComparePrev] = useState<boolean>(
    initial?.config?.kind === "timeseries"
      ? !!initial.config.comparePrev
      : false,
  );

  // Resolve the picked (source, agg, fieldId) → metric id so the Top-N
  // step can show only the groupings that metric supports. Custom fields
  // resolve to `null` (synthetic `__custom:` ids don't expose
  // groupByOptions yet) — we hide the timeseries/groupby shape pills
  // when this is null.
  const resolvedMetricId = useMemo(() => {
    if (fieldId.startsWith("custom:")) return null;
    return findMetricId(source, aggregation, fieldId, resolvedObject);
  }, [source, resolvedObject, aggregation, fieldId]);

  const groupByOptions = useMemo(() => {
    if (!resolvedMetricId) return [];
    const m = CLIENT_METRICS.find((x) => x.id === resolvedMetricId);
    return m?.groupByOptions ?? [];
  }, [resolvedMetricId]);

  const [groupBy, setGroupBy] = useState<string>(
    initial?.config?.kind === "groupby" ? initial.config.groupBy : "",
  );
  const [topLimit, setTopLimit] = useState<number>(
    initial?.config?.kind === "groupby" ? (initial.config.limit ?? 10) : 10,
  );

  // When the metric or its groupings change, keep `groupBy` valid —
  // otherwise we'd save a config with a column that doesn't exist on
  // the target table and the executor would error.
  useMemo(() => {
    if (shape !== "groupby") return;
    if (!groupByOptions.find((g) => g.field === groupBy)) {
      setGroupBy(groupByOptions[0]?.field ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedMetricId, shape]);

  // If the picked field stops supporting non-single shapes (e.g. user
  // switched to a custom field, or to an aggregation whose metric has
  // no groupings), fall back to "single" so we never save an invalid
  // config.
  useMemo(() => {
    if (shape !== "single" && !resolvedMetricId) {
      setShape("single");
      return;
    }
    if (shape === "groupby" && groupByOptions.length === 0) {
      setShape("single");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedMetricId, groupByOptions.length]);

  // ─── Step 5
  const [filters, setFilters] = useState<Filter[]>(
    initial?.config?.filters ?? [],
  );

  // ─── Step 6
  // Date field menu = standard date columns + operator's picked custom
  // datetime fields. The executor's `resolveDateColumn` recognises the
  // `custom:` prefix and json_extracts on `custom_properties`.
  const dateFieldOptions = useMemo(() => {
    const standard = dateFieldsForSource(source, resolvedObject);
    const customDates = (customFor(source) ?? [])
      .filter((c) => {
        if (c.type !== "datetime" && c.type !== "date") return false;
        if (source !== "hubspot") return true;
        // Same Deal/Contact label heuristic as the field menu — keep
        // contact-only date fields out of the deal flow.
        const isContact = c.label?.startsWith("Contact");
        return resolvedObject === "contacts" ? isContact : !isContact;
      })
      .map((c) => ({ id: c.id, source, label: c.label }));
    return [...standard, ...customDates];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, resolvedObject, customFieldsBySource]);
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

  // ─── Step 7
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(
    initial?.config?.outputFormat ?? "currency",
  );

  // ─── Step 8
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

  function buildConfig(): QueryConfig {
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
      // Prefer the wizard's explicit Object picker as the source of
      // truth; fall back to the "Deal · "/"Contact · " label
      // heuristic only when the picker isn't applicable (Stripe).
      const customs = customFor(source) ?? [];
      const c = customs.find((x) => x.id === fieldId);
      const inferredObject =
        source === "hubspot"
          ? resolvedObject === "contacts"
            ? "contacts"
            : "deals"
          : c?.label?.startsWith("Contact")
            ? "contacts"
            : "deals";
      metricId = `__custom:${source}:${inferredObject}:${aggregation}:${propName}`;
    } else {
      metricId = findMetricId(source, aggregation, fieldId, resolvedObject);
    }
    if (!metricId) {
      throw new Error(
        `No metric registered for ${aggregation} of ${fieldId} on ${source}. Pick a different field.`,
      );
    }
    const base = {
      source,
      metric: metricId,
      filters,
      dateRange,
      dateField: dateField || undefined,
      outputFormat,
      conditionalColors: colorsEnabled ? colors : undefined,
    };
    if (shape === "timeseries") {
      return {
        kind: "timeseries",
        ...base,
        bucket,
        // Only emit `comparePrev` when on — keeps saved configs minimal
        // and avoids burning an extra query pass for the SEED case.
        comparePrev: comparePrev || undefined,
      };
    }
    if (shape === "groupby") {
      if (!groupBy) {
        throw new Error(
          "Pick a grouping field for Top N (e.g. Owner, Stage, Pipeline).",
        );
      }
      return {
        kind: "groupby",
        ...base,
        groupBy,
        limit: topLimit,
      };
    }
    return { kind: "single", ...base };
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
    let config: QueryConfig;
    try {
      config = buildConfig();
    } catch (err) {
      // buildConfig throws user-facing validation messages ("Pick a
      // grouping field…") — surface inline next to the actions so the
      // operator sees it in context with the form.
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const finalName = name.trim() || "Untitled query";
    startSave(async () => {
      const res = initial
        ? await updateQueryAction({ id: initial.id, name: finalName, config })
        : await createQueryAction({ name: finalName, config });
      if (!res.ok) {
        toast.error({
          title: initial ? "Couldn't save changes" : "Couldn't save query",
          description: res.error,
        });
        return;
      }
      toast.success({ title: initial ? "Query saved" : "Query created" });
      router.push(`/queries`);
    });
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
        {/* HubSpot has two queryable objects — surface the picker
            inline so Contacts isn't silently unreachable. Stripe
            only has Charges so we hide the picker entirely. */}
        {source === "hubspot" && (
          <div style={{ marginTop: 10 }}>
            <Segmented
              value={hubspotObject}
              options={[
                { value: "deals", label: "Deals" },
                { value: "contacts", label: "Contacts" },
              ]}
              onChange={setHubspotObject}
            />
          </div>
        )}
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

      <Step n={4} title="Show as">
        <ShapeSelector
          shape={shape}
          onShape={setShape}
          // Non-single shapes need a registered metric — custom fields
          // don't have groupings yet and timeseries would have to invent
          // a bucket date column. Disable + explain.
          allowTimeseries={!!resolvedMetricId}
          allowGroupby={groupByOptions.length > 0}
          bucket={bucket}
          onBucket={setBucket}
          comparePrev={comparePrev}
          onComparePrev={setComparePrev}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
          groupByOptions={groupByOptions}
          topLimit={topLimit}
          onTopLimit={setTopLimit}
        />
      </Step>

      <Step n={5} title="Filters">
        <FiltersEditor
          source={source}
          object={resolvedObject}
          filters={filters}
          onChange={setFilters}
          allowedFields={allowedFor(source)}
          customFields={customFor(source)}
          standardEnumOptions={standardEnumFor(source)}
        />
      </Step>

      <Step n={6} title="Date field">
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

      <Step n={7} title="Output format">
        <Segmented
          value={outputFormat}
          options={OUTPUT_FORMATS.map((o) => ({
            value: o,
            label: OUTPUT_FORMAT_LABEL[o],
          }))}
          onChange={setOutputFormat}
        />
      </Step>

      <Step n={8} title="Conditional colors">
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
// Shape selector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 4 — pick which executor `kind` the query produces:
 *
 *  - **single**     → one number (default — feeds Single value / Gauge widgets)
 *  - **timeseries** → bucketed values over the date window (feeds Bar widgets)
 *  - **groupby**    → top-N rows grouped by a column (feeds Ranking widgets)
 *
 * The non-single shapes need a resolved metric id (custom fields aren't
 * supported there yet) and, for groupby, at least one registered
 * grouping option. We disable the pill instead of hiding it so the user
 * can see the shape exists and learn why it's locked.
 */
function ShapeSelector({
  shape,
  onShape,
  allowTimeseries,
  allowGroupby,
  bucket,
  onBucket,
  comparePrev,
  onComparePrev,
  groupBy,
  onGroupBy,
  groupByOptions,
  topLimit,
  onTopLimit,
}: {
  shape: QueryKind;
  onShape: (s: QueryKind) => void;
  allowTimeseries: boolean;
  allowGroupby: boolean;
  bucket: Bucket;
  onBucket: (b: Bucket) => void;
  comparePrev: boolean;
  onComparePrev: (v: boolean) => void;
  groupBy: string;
  onGroupBy: (v: string) => void;
  groupByOptions: ReadonlyArray<{ field: string; label: string }>;
  topLimit: number;
  onTopLimit: (n: number) => void;
}) {
  const shapeOptions: Array<{
    value: QueryKind;
    label: string;
    disabled: boolean;
    hint: string;
  }> = [
    {
      value: "single",
      label: "Single value",
      disabled: false,
      hint: "One number for Single value & Gauge widgets.",
    },
    {
      value: "timeseries",
      label: "Over time",
      disabled: !allowTimeseries,
      hint: allowTimeseries
        ? "Bucketed values over the date window — for Bar widgets."
        : "Pick a standard field above to enable this shape.",
    },
    {
      value: "groupby",
      label: "Top N by…",
      disabled: !allowGroupby,
      hint: allowGroupby
        ? "Top N grouped by a column — for Ranking widgets."
        : allowTimeseries
          ? "This function has no group-by columns registered yet."
          : "Pick a standard field above to enable this shape.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        role="radiogroup"
        style={{
          display: "inline-flex",
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 2,
          gap: 2,
          alignSelf: "flex-start",
        }}
      >
        {shapeOptions.map((o) => {
          const active = o.value === shape;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={o.disabled}
              title={o.hint}
              onClick={() => !o.disabled && onShape(o.value)}
              style={{
                padding: "8px 14px",
                background: active ? "var(--bg)" : "transparent",
                border: "1px solid",
                borderColor: active ? "var(--border-strong)" : "transparent",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: o.disabled
                  ? "var(--text-muted)"
                  : active
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                cursor: o.disabled ? "not-allowed" : "pointer",
                opacity: o.disabled ? 0.6 : 1,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Hint line — explains why the current shape is what it is */}
      <p
        className="t-small"
        style={{ color: "var(--text-muted)", margin: 0 }}
      >
        {shapeOptions.find((o) => o.value === shape)?.hint}
      </p>

      {/* Sub-controls for the picked shape */}
      {shape === "timeseries" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 12,
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              className="t-small"
              style={{ color: "var(--text-tertiary)", minWidth: 60 }}
            >
              Bucket
            </span>
            <div
              role="radiogroup"
              style={{
                display: "inline-flex",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 2,
                gap: 2,
              }}
            >
              {BUCKETS.map((b) => {
                const active = b === bucket;
                return (
                  <button
                    key={b}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onBucket(b)}
                    style={{
                      padding: "6px 12px",
                      background: active ? "var(--bg-elev-2)" : "transparent",
                      border: "1px solid",
                      borderColor: active ? "var(--border-strong)" : "transparent",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: active ? 500 : 400,
                      color: active
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <input
              type="checkbox"
              checked={comparePrev}
              onChange={(e) => onComparePrev(e.target.checked)}
              style={{ accentColor: "var(--primary)" }}
            />
            Compare to previous period
          </label>
        </div>
      )}

      {shape === "groupby" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 130px",
            gap: 12,
            padding: 12,
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              className="t-small"
              style={{ color: "var(--text-tertiary)" }}
            >
              Group by
            </span>
            <select
              value={groupBy}
              onChange={(e) => onGroupBy(e.target.value)}
              style={selectStyle}
            >
              {groupByOptions.length === 0 && (
                <option value="">No groupings available</option>
              )}
              {groupByOptions.map((g) => (
                <option key={g.field} value={g.field}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              className="t-small"
              style={{ color: "var(--text-tertiary)" }}
            >
              Top N
            </span>
            <input
              type="number"
              min={1}
              max={50}
              value={topLimit}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) {
                  onTopLimit(Math.max(1, Math.min(50, n)));
                }
              }}
              style={{ ...inputStyle, textAlign: "right" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// FiltersEditor + MultiEnumPicker now live in ./FiltersEditor.tsx so
// the Edit-Widget dialog can reuse them without dragging the whole
// wizard into the dashboard bundle. The import is at the top of this
// file.

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
