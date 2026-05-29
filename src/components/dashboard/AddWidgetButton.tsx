"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icons } from "@/components/ui/Icon";
import { addWidget } from "@/lib/dashboards";
import { toast } from "@/lib/toast";
import type { WidgetType } from "@/lib/queries/compat";

const TYPES: Array<{
  type: WidgetType;
  label: string;
  description: string;
  hint: string;
}> = [
  {
    type: "singleValue",
    label: "Single value",
    description: "Big number + delta",
    hint: "Bind a single-result query (e.g., MRR, total leads).",
  },
  {
    type: "gauge",
    label: "Gauge",
    description: "Progress toward a target",
    hint: "Bind a single-result query; configure the target separately.",
  },
  {
    type: "bar",
    label: "Bar chart",
    description: "Values over time",
    hint: "Bind a trend (timeseries) query.",
  },
  {
    type: "funnel",
    label: "Funnel",
    description: "Conversion across stages",
    hint: "Multi-stage funnel queries arrive in a later slice — uses demo data for now.",
  },
  {
    type: "ranking",
    label: "Ranking",
    description: "Top-N leaderboard",
    hint: "Bind a group-by query (e.g., revenue per owner).",
  },
  {
    type: "text",
    label: "Text",
    description: "Headline or note",
    hint: "Static text — a section heading or annotation. No query needed.",
  },
  {
    type: "image",
    label: "Image",
    description: "Logo or photo by URL",
    hint: "Static image from a URL — a logo or banner. No query needed.",
  },
];

/**
 * Top-bar "Add widget" CTA. Opens a modal of widget-type tiles; selecting
 * one appends a fresh widget to `dashboards.layout` via server action. The
 * new widget renders unbound; users click its overflow menu to bind it
 * to a saved query.
 *
 * `primary` switches the button styling — used in the empty-canvas slot.
 */
export function AddWidgetButton({
  dashboardId,
  primary,
}: {
  dashboardId: string;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pendingType, setPendingType] = useState<WidgetType | null>(null);
  const [, startTransition] = useTransition();

  function pick(type: WidgetType) {
    setPendingType(type);
    startTransition(async () => {
      try {
        await addWidget(dashboardId, type);
        setOpen(false);
      } catch (err) {
        toast.error({
          title: "Couldn't add widget",
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setPendingType(null);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={primary ? "btn btn-primary" : "btn btn-sm"}
          style={primary ? { marginTop: 4 } : undefined}
        >
          <Icons.Plus size={primary ? 14 : 14} /> Add widget
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(1, 2, 88, 0.32)",
            backdropFilter: "blur(2px)",
            zIndex: 50,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(720px, 96vw)",
            maxHeight: "86vh",
            overflow: "auto",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            boxShadow: "var(--shadow-lg)",
            padding: 24,
            zIndex: 51,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div>
              <Dialog.Title asChild>
                <div className="t-h3">Add widget</div>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p
                  className="t-small"
                  style={{ margin: 0, color: "var(--text-tertiary)" }}
                >
                  Pick a widget type. You can bind it to a saved query after
                  it lands on the canvas.
                </p>
              </Dialog.Description>
            </div>
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {TYPES.map((t) => {
              const isPending = pendingType === t.type;
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => pick(t.type)}
                  disabled={!!pendingType}
                  style={{
                    background: "var(--bg-elev-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 16,
                    textAlign: "left",
                    cursor: pendingType ? "default" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    transition: "all 140ms ease-out",
                  }}
                  onMouseEnter={(e) => {
                    if (!pendingType) e.currentTarget.style.borderColor = "var(--border-brand)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                >
                  <WidgetThumbnail type={t.type} />
                  <div className="t-h4" style={{ marginTop: 4 }}>
                    {t.label}
                  </div>
                  <div className="t-small">{t.description}</div>
                  <div
                    className="t-small"
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {isPending ? "Adding…" : t.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Tiny SVG thumbnails for each widget type — keeps the picker visual. */
function WidgetThumbnail({ type }: { type: WidgetType }) {
  const box = {
    width: "100%",
    height: 64,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    padding: 8,
  } as const;
  switch (type) {
    case "singleValue":
      return (
        <div style={box}>
          <span
            className="t-mono"
            style={{ fontSize: 24, color: "var(--primary)", fontWeight: 500 }}
          >
            €387K
          </span>
        </div>
      );
    case "gauge":
      return (
        <div style={box}>
          <svg width="80" height="48" viewBox="0 0 80 48" aria-hidden="true">
            <path
              d="M 8 40 A 32 32 0 0 1 72 40"
              stroke="var(--bg-elev-3)"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M 8 40 A 32 32 0 0 1 60 16"
              stroke="var(--primary)"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    case "bar":
      return (
        <div style={box}>
          <svg width="80" height="48" viewBox="0 0 80 48" aria-hidden="true">
            {[6, 14, 22, 30, 38, 46, 54, 62].map((x, i) => {
              const h = [12, 24, 18, 30, 36, 22, 38, 44][i];
              return (
                <rect
                  key={x}
                  x={x}
                  y={44 - h}
                  width="6"
                  height={h}
                  fill="var(--primary)"
                  rx="1"
                />
              );
            })}
          </svg>
        </div>
      );
    case "funnel":
      return (
        <div style={box}>
          <svg width="80" height="48" viewBox="0 0 80 48" aria-hidden="true">
            <polygon
              points="8,8 72,8 64,20 16,20"
              fill="var(--primary)"
              opacity="0.85"
            />
            <polygon
              points="16,24 64,24 56,36 24,36"
              fill="var(--primary)"
              opacity="0.55"
            />
            <polygon
              points="24,40 56,40 52,46 28,46"
              fill="var(--success)"
              opacity="0.75"
            />
          </svg>
        </div>
      );
    case "ranking":
      return (
        <div style={box}>
          <svg width="80" height="48" viewBox="0 0 80 48" aria-hidden="true">
            {[
              { y: 8, w: 60 },
              { y: 22, w: 48 },
              { y: 36, w: 32 },
            ].map((r, i) => (
              <g key={i}>
                <rect x="6" y={r.y} width="4" height="8" fill="var(--text-muted)" rx="1" />
                <rect
                  x="14"
                  y={r.y + 1}
                  width={r.w}
                  height="6"
                  fill="var(--primary)"
                  rx="2"
                />
              </g>
            ))}
          </svg>
        </div>
      );
    case "text":
      return (
        <div style={box}>
          <svg width="80" height="48" viewBox="0 0 80 48" aria-hidden="true">
            <text
              x="40"
              y="20"
              textAnchor="middle"
              fontSize="16"
              fontWeight="600"
              fill="var(--primary)"
            >
              Aa
            </text>
            <rect x="16" y="30" width="48" height="4" fill="var(--text-muted)" rx="2" />
            <rect x="24" y="38" width="32" height="4" fill="var(--text-muted)" rx="2" opacity="0.6" />
          </svg>
        </div>
      );
    case "image":
      return (
        <div style={box}>
          <svg width="80" height="48" viewBox="0 0 80 48" aria-hidden="true">
            <rect
              x="12"
              y="8"
              width="56"
              height="32"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              rx="3"
            />
            <circle cx="26" cy="20" r="4" fill="var(--primary)" />
            <path
              d="M 16 36 L 32 24 L 44 32 L 56 20 L 64 28 L 64 36 Z"
              fill="var(--primary)"
              opacity="0.55"
            />
          </svg>
        </div>
      );
  }
}
