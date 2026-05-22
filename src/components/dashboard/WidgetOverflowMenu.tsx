"use client";

import { useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import { bindWidget, removeWidget } from "@/lib/dashboards";
import { QueryPickerDialog } from "./QueryPickerDialog";
import type { WidgetType } from "@/lib/queries/compat";

/**
 * Per-widget dropdown. Bind / Unbind / Remove.
 *
 * `Bind a query` opens a Radix Dialog with saved queries filtered to the
 * shapes this widget type can render.
 */
export function WidgetOverflowMenu({
  dashboardId,
  widgetId,
  widgetType,
  widgetName,
  hasBinding,
}: {
  dashboardId: string;
  widgetId: string;
  widgetType: WidgetType;
  widgetName: string;
  hasBinding: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="widget-iconbtn"
            aria-label={`Open menu for ${widgetName}`}
            title="Widget actions"
            style={{ width: 26, height: 26, borderRadius: 6 }}
          >
            <Icons.More size={14} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow-md)",
              padding: 6,
              minWidth: 200,
              zIndex: 100,
            }}
          >
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                setPickerOpen(true);
              }}
              style={menuItemStyle("primary")}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <Icons.Plug size={14} /> {hasBinding ? "Change query" : "Bind a query"}
            </DropdownMenu.Item>
            {hasBinding && (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  startTransition(async () => {
                    await bindWidget(dashboardId, widgetId, null);
                  });
                }}
                style={menuItemStyle("normal")}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <Icons.Close size={14} /> Unbind
              </DropdownMenu.Item>
            )}
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                if (!confirm(`Remove this ${widgetType} widget?`)) return;
                startTransition(async () => {
                  await removeWidget(dashboardId, widgetId);
                });
              }}
              style={menuItemStyle("danger")}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--danger-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <Icons.Close size={14} /> Remove widget
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <QueryPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        dashboardId={dashboardId}
        widgetId={widgetId}
        widgetType={widgetType}
      />
    </>
  );
}

function menuItemStyle(tone: "primary" | "normal" | "danger"): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    color: tone === "danger" ? "var(--danger)" : "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    outline: "none",
  };
}
