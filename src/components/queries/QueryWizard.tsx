"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/Icon";
import type { ClientMetric } from "@/lib/queries/catalog";
import {
  createQueryAction,
  previewQueryAction,
} from "@/lib/queries/actions";
import {
  BUCKETS,
  DATE_RANGES,
  type Bucket,
  type DateRange,
  type Filter,
  type Source,
  type QueryKind,
} from "@/lib/queries/ast";
import { BarChart } from "@/components/widgets";

/**
 * One-page query wizard.
 *
 * Shape selector at the top branches the form: `single` shows nothing extra,
 * `timeseries` adds a bucket selector + compare-previous toggle, `groupby`
 * adds a "group by" dropdown (metric-aware). The preview pane swaps its
 * visualization to match.
 */
const RANGE_LABEL: Record<DateRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "this-week": "This week",
  "last-7-days": "Last 7 days",
  "this-month": "This month",
  "last-30-days": "Last 30 days",
  "this-quarter": "This quarter",
  "this-year": "This year",
  "all-time": "All time",
};

const BUCKET_LABEL: Record<Bucket, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

type PreviewState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "ok";
      kind: QueryKind;
      // Common
      ms: number;
      // Single
      formatted?: string | null;
      // Timeseries
      points?: Array<{ label: string; value: number; prev?: number }>;
      // Groupby
      rows?: Array<{ key: string; label?: string; value: number }>;
      formatter?: "EUR-cents" | "EUR" | "count" | "percent";
    }
  | { status: "error"; error: string };

export function QueryWizard({ metrics }: { metrics: ClientMetric[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shape, setShape] = useState<QueryKind>("single");
  const [source, setSource] = useState<Source>("stripe");
  const [metricId, setMetricId] = useState<string>(
    metrics.find((m) => m.source === "stripe")?.id ?? "",
  );
  const [filters, setFilters] = useState<Filter[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>("this-month");
  const [bucket, setBucket] = useState<Bucket>("week");
  const [comparePrev, setComparePrev] = useState(false);
  const [groupBy, setGroupBy] = useState<string>("");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [previewing, startPreview] = useTransition();

  const availableMetrics = useMemo(
    () => metrics.filter((m) => m.source === source),
    [metrics, source],
  );
  const currentMetric = metrics.find((m) => m.id === metricId);
  const groupByOptions = currentMetric?.groupByOptions ?? [];

  // Maintain a sensible default groupBy whenever the metric changes.
  useMemo(() => {
    if (shape === "groupby") {
      if (!groupByOptions.find((o) => o.field === groupBy)) {
        setGroupBy(groupByOptions[0]?.field ?? "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricId, shape]);

  function changeSource(next: Source) {
    setSource(next);
    const first = metrics.find((m) => m.source === next);
    setMetricId(first?.id ?? "");
    setFilters([]);
    setGroupBy("");
    setPreview({ status: "idle" });
  }

  function changeMetric(next: string) {
    setMetricId(next);
    setFilters([]);
    setGroupBy("");
    setPreview({ status: "idle" });
  }

  function changeShape(next: QueryKind) {
    setShape(next);
    setPreview({ status: "idle" });
    if (next === "groupby" && !groupBy && groupByOptions.length > 0) {
      setGroupBy(groupByOptions[0].field);
    }
  }

  function buildConfig() {
    const base = { source, metric: metricId, filters, dateRange };
    if (shape === "timeseries") {
      return { kind: "timeseries" as const, ...base, bucket, comparePrev };
    }
    if (shape === "groupby") {
      return { kind: "groupby" as const, ...base, groupBy, limit: 10 };
    }
    return { kind: "single" as const, ...base };
  }

  function runPreview() {
    setPreview({ status: "running" });
    const config = buildConfig();
    startPreview(async () => {
      const res = await previewQueryAction(config);
      if (res.ok) {
        // Result shape is a discriminated union — narrow on `kind`.
        if (res.kind === "single") {
          setPreview({
            status: "ok",
            kind: "single",
            ms: res.ms,
            formatted: res.formatted,
            formatter: res.formatter,
          });
        } else if (res.kind === "timeseries") {
          setPreview({
            status: "ok",
            kind: "timeseries",
            ms: res.ms,
            points: res.points,
            formatter: res.formatter,
          });
        } else {
          setPreview({
            status: "ok",
            kind: "groupby",
            ms: res.ms,
            rows: res.rows,
            formatter: res.formatter,
          });
        }
      } else {
        setPreview({ status: "error", error: res.error });
      }
    });
  }

  function save() {
    setSaveError(null);
    const config = buildConfig();
    startSave(async () => {
      const res = await createQueryAction({
        name:
          name.trim() ||
          `${currentMetric?.label ?? "Query"}, ${RANGE_LABEL[dateRange]}`,
        config,
      });
      if (res.ok) router.push("/queries");
      else setSaveError(res.error);
    });
  }

  const canSave =
    !!metricId &&
    !saving &&
    (shape !== "groupby" || !!groupBy);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 420px",
        gap: 24,
        maxWidth: 1200,
      }}
    >
      {/* Builder */}
      <div
        className="card"
        style={{ display: "flex", flexDirection: "column", gap: 24 }}
      >
        <Field label="Name" hint="Shows up in the queries list and widget pickers.">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled query"
            style={inputStyle}
          />
        </Field>

        <Field label="Shape" hint={shapeHint(shape)}>
          <Segmented
            value={shape}
            options={[
              { value: "single", label: "Single value" },
              { value: "timeseries", label: "Trend" },
              { value: "groupby", label: "Group by" },
            ]}
            onChange={(v) => changeShape(v as QueryKind)}
          />
        </Field>

        <Field label="Data source">
          <Segmented
            value={source}
            options={[
              { value: "stripe", label: "Stripe" },
              { value: "hubspot", label: "HubSpot" },
            ]}
            onChange={(v) => changeSource(v as Source)}
          />
        </Field>

        <Field label="Metric" hint={currentMetric?.description}>
          <select
            value={metricId}
            onChange={(e) => changeMetric(e.target.value)}
            style={{ ...inputStyle, paddingRight: 32 }}
          >
            {availableMetrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        {shape === "timeseries" && (
          <>
            <Field label="Bucket" hint="Granularity of each point on the trend.">
              <Segmented
                value={bucket}
                options={BUCKETS.map((b) => ({ value: b, label: BUCKET_LABEL[b] }))}
                onChange={(v) => setBucket(v as Bucket)}
              />
            </Field>
            <Field label="Comparison">
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={comparePrev}
                  onChange={(e) => setComparePrev(e.target.checked)}
                />
                Compare to the previous period
              </label>
            </Field>
          </>
        )}

        {shape === "groupby" && (
          <Field label="Group by" hint="The dimension that becomes the rows.">
            {groupByOptions.length === 0 ? (
              <p
                className="t-small"
                style={{ margin: 0, color: "var(--text-muted)" }}
              >
                This metric has no group-by dimensions yet.
              </p>
            ) : (
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                style={{ ...inputStyle, paddingRight: 32 }}
              >
                {groupByOptions.map((o) => (
                  <option key={o.field} value={o.field}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <Field label="Filters" hint="Constrain the rows the metric considers.">
          <Filters metric={currentMetric} filters={filters} onChange={setFilters} />
        </Field>

        <Field label="Date range">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {DATE_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={`range-pill ${r === dateRange ? "is-active" : ""}`}
                onClick={() => setDateRange(r)}
                style={
                  r === dateRange
                    ? {
                        background: "var(--primary-soft)",
                        color: "var(--primary)",
                        border: "1px solid var(--border-brand)",
                      }
                    : { cursor: "pointer" }
                }
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </Field>

        <div
          style={{
            display: "flex",
            gap: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={runPreview}
            disabled={previewing || !metricId || (shape === "groupby" && !groupBy)}
          >
            <Icons.Refresh size={14} /> {previewing ? "Running…" : "Preview"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={!canSave}
            style={{ marginLeft: "auto" }}
          >
            <Icons.Save size={14} /> {saving ? "Saving…" : "Save query"}
          </button>
        </div>
        {saveError && (
          <p className="t-small" style={{ color: "var(--danger)", margin: 0 }}>
            {saveError}
          </p>
        )}
      </div>

      {/* Preview pane */}
      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          position: "sticky",
          top: 24,
          height: "fit-content",
        }}
      >
        <div className="t-micro">Preview</div>
        {preview.status === "idle" && (
          <p className="t-small" style={{ margin: 0 }}>
            Click <strong>Preview</strong> to run this query against your live
            data without saving.
          </p>
        )}
        {preview.status === "running" && (
          <p className="t-small" style={{ margin: 0 }}>
            Running…
          </p>
        )}
        {preview.status === "error" && (
          <p
            className="t-small"
            style={{
              margin: 0,
              color: "var(--danger)",
              background: "var(--danger-soft)",
              padding: "8px 12px",
              borderRadius: 10,
            }}
          >
            {preview.error}
          </p>
        )}

        {preview.status === "ok" && preview.kind === "single" && (
          <>
            <div
              className="t-mono"
              style={{
                fontSize: 48,
                color: "var(--text-primary)",
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {preview.formatted ?? "—"}
            </div>
            <div className="t-small">
              {preview.ms}ms · {currentMetric?.label.toLowerCase()} ·{" "}
              {RANGE_LABEL[dateRange].toLowerCase()}
            </div>
          </>
        )}

        {preview.status === "ok" && preview.kind === "timeseries" && (
          <>
            {(preview.points ?? []).length === 0 ? (
              <p className="t-small" style={{ margin: 0 }}>
                No rows in this window yet — connect or sync the source.
              </p>
            ) : (
              <div style={{ marginTop: -8 }}>
                <BarChart
                  data={(preview.points ?? []).map((p) => ({
                    label: p.label,
                    value: scaleForUnit(p.value, preview.formatter),
                    prev:
                      p.prev != null ? scaleForUnit(p.prev, preview.formatter) : undefined,
                  }))}
                />
              </div>
            )}
            <div className="t-small">
              {preview.ms}ms · {preview.points?.length ?? 0} {bucket}s
            </div>
          </>
        )}

        {preview.status === "ok" && preview.kind === "groupby" && (
          <>
            {(preview.rows ?? []).length === 0 ? (
              <p className="t-small" style={{ margin: 0 }}>
                No rows in this window yet.
              </p>
            ) : (
              <GroupByPreview
                rows={preview.rows ?? []}
                formatter={preview.formatter ?? "count"}
              />
            )}
            <div className="t-small">
              {preview.ms}ms · top {preview.rows?.length ?? 0}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small bits
// ─────────────────────────────────────────────────────────────────────────────

function shapeHint(kind: QueryKind): string {
  switch (kind) {
    case "single":
      return "One aggregated number — perfect for KPI tiles and gauges.";
    case "timeseries":
      return "Values bucketed over time — drives bar and line charts.";
    case "groupby":
      return "Top-N values grouped by a column — drives rankings and bar charts.";
  }
}

/** EUR-cents need /100 to display; everything else passes through. */
function scaleForUnit(
  v: number,
  formatter: "EUR-cents" | "EUR" | "count" | "percent" | undefined,
): number {
  if (formatter === "EUR-cents") return v / 100;
  return v;
}

const inputStyle: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 10,
  background: "var(--bg-elev-2)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: 13,
  width: "100%",
  outline: "none",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label className="t-micro">{label}</label>
      {children}
      {hint && (
        <p className="t-small" style={{ margin: 0, color: "var(--text-muted)" }}>
          {hint}
        </p>
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
        padding: 4,
        background: "var(--bg-elev-2)",
        borderRadius: 10,
        border: "1px solid var(--border)",
        gap: 2,
        width: "fit-content",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{
              padding: "6px 14px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 500,
              color: on ? "var(--text-primary)" : "var(--text-tertiary)",
              background: on ? "var(--bg)" : "transparent",
              boxShadow: on ? "var(--shadow-sm)" : "none",
              transition: "all 120ms ease-out",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Filters({
  metric,
  filters,
  onChange,
}: {
  metric: ClientMetric | undefined;
  filters: Filter[];
  onChange: (next: Filter[]) => void;
}) {
  if (!metric || metric.filters.length === 0) {
    return (
      <p className="t-small" style={{ margin: 0, color: "var(--text-muted)" }}>
        This metric has no configurable filters.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {metric.filters.map((opt) => {
        const current = filters.find((f) => f.field === opt.field);
        return (
          <div
            key={opt.field}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr 32px",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span className="t-small">{opt.label}</span>
            <select
              value={(current?.value as string) ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  onChange(filters.filter((f) => f.field !== opt.field));
                } else {
                  const next: Filter = { field: opt.field, op: opt.op, value: v };
                  const others = filters.filter((f) => f.field !== opt.field);
                  onChange([...others, next]);
                }
              }}
              style={{ ...inputStyle, height: 34 }}
            >
              <option value="">— any —</option>
              {opt.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {current ? (
              <button
                type="button"
                className="widget-iconbtn"
                aria-label={`Clear ${opt.label} filter`}
                onClick={() => onChange(filters.filter((f) => f.field !== opt.field))}
                style={{ width: 28, height: 28, borderRadius: 6 }}
              >
                <Icons.Close size={12} />
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GroupByPreview({
  rows,
  formatter,
}: {
  rows: Array<{ key: string; label?: string; value: number }>;
  formatter: "EUR-cents" | "EUR" | "count" | "percent";
}) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => {
        const pct = max === 0 ? 0 : (r.value / max) * 100;
        const displayValue =
          formatter === "EUR-cents"
            ? `€${(r.value / 100 / 1000).toFixed(1)}K`
            : formatter === "EUR"
              ? `€${(r.value / 1000).toFixed(1)}K`
              : Math.round(r.value).toLocaleString("en-US");
        return (
          <div
            key={r.key + i}
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 240,
                }}
              >
                {r.label ?? r.key}
              </span>
              <span
                className="t-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {displayValue}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--bg-elev-2)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--primary), var(--primary-hover))",
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
