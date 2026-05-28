"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { Icons } from "@/components/ui/Icon";
import { bindWidget } from "@/lib/dashboards";
import { listQueriesForPicker } from "@/lib/queries/actions";
import { toast } from "@/lib/toast";
import { WIDGET_ACCEPTS, type WidgetType } from "@/lib/queries/compat";

type PickerRow = Awaited<ReturnType<typeof listQueriesForPicker>>[number];

/**
 * Saved-query picker shown from the widget overflow menu.
 *
 * Loads queries on open (cheap; user-triggered), filters to shapes the
 * widget type can render, and binds the selected query via server action.
 */
export function QueryPickerDialog({
  open,
  onOpenChange,
  dashboardId,
  widgetId,
  widgetType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  widgetId: string;
  widgetType: WidgetType;
}) {
  const [rows, setRows] = useState<PickerRow[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const accepted = WIDGET_ACCEPTS[widgetType];

  useEffect(() => {
    if (!open) return;
    setRows(null);
    listQueriesForPicker()
      .then(setRows)
      .catch(() => {
        setRows([]);
        toast.error({ title: "Couldn't load queries" });
      });
  }, [open]);

  const compatible = (rows ?? []).filter((r) => accepted.includes(r.kind));
  const incompatible = (rows ?? []).filter((r) => !accepted.includes(r.kind));

  function pick(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await bindWidget(dashboardId, widgetId, id);
        toast.success({ title: "Query bound" });
        onOpenChange(false);
      } catch (err) {
        toast.error({
          title: "Couldn't bind query",
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setPendingId(null);
      }
    });
  }

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
            maxHeight: "80vh",
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
              marginBottom: 12,
            }}
          >
            <div>
              <Dialog.Title asChild>
                <div className="t-h3">Bind a query</div>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p
                  className="t-small"
                  style={{ margin: 0, color: "var(--text-tertiary)" }}
                >
                  Accepts <strong>{accepted.length ? accepted.join(" or ") : "no kinds yet"}</strong>{" "}
                  for {widgetType} widgets.
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

          {rows === null && (
            <p className="t-small" style={{ color: "var(--text-muted)" }}>
              Loading queries…
            </p>
          )}

          {rows !== null && compatible.length === 0 && (
            <div
              style={{
                background: "var(--bg-elev-2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                textAlign: "center",
              }}
            >
              <p className="t-small" style={{ margin: 0, color: "var(--text-secondary)" }}>
                No compatible saved queries yet.
              </p>
              <Link
                href="/queries/new"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => onOpenChange(false)}
              >
                <Icons.Plus size={14} /> Build a new query
              </Link>
            </div>
          )}

          {rows !== null && compatible.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {compatible.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => pick(q.id)}
                  disabled={!!pendingId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    background: "var(--bg-elev-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!pendingId) e.currentTarget.style.borderColor = "var(--border-brand)";
                  }}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                      {q.name}
                    </span>
                    <span className="t-small">{q.kind} · {q.source}</span>
                  </div>
                  <span
                    className="t-mono"
                    style={{ color: "var(--text-primary)", fontWeight: 500 }}
                  >
                    {q.summary ?? "—"}
                  </span>
                  <span style={{ color: "var(--text-tertiary)" }}>
                    {pendingId === q.id ? (
                      <Icons.Refresh size={14} />
                    ) : (
                      <Icons.ChevronRight size={14} />
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {incompatible.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="t-micro" style={{ marginBottom: 8 }}>
                Not compatible
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {incompatible.map((q) => (
                  <li
                    key={q.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 12px",
                      color: "var(--text-tertiary)",
                      fontSize: 12,
                    }}
                  >
                    <span>{q.name}</span>
                    <span>{q.kind}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
