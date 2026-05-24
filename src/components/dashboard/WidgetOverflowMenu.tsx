"use client";

import { useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import { bindWidget, removeWidget } from "@/lib/dashboards";
import { QueryPickerDialog } from "./QueryPickerDialog";
import { EditWidgetDialog } from "./EditWidgetDialog";
import type { WidgetChip } from "./widgetChip";
import type { TimePeriod } from "@/lib/timePeriod";
import type { WidgetType } from "@/lib/queries/compat";

/**
 * Per-widget dropdown.
 *
 * Edit title · Bind / Unbind · Remove. Title editing tops the list
 * because most layout work after `Add widget` is renaming + sizing.
 */
export function WidgetOverflowMenu({
  dashboardId,
  widgetId,
  widgetType,
  widgetName,
  hasBinding,
  currentTitle,
  currentTitleSize,
  currentTitleAlign,
  currentChip,
  currentTimePeriod,
  currentTarget,
}: {
  dashboardId: string;
  widgetId: string;
  widgetType: WidgetType;
  widgetName: string;
  hasBinding: boolean;
  /** The title the widget is currently rendering. */
  currentTitle: string;
  /** Explicit titleSize override (px), or undefined for auto. */
  currentTitleSize?: number;
  /** Current title alignment. */
  currentTitleAlign?: "left" | "center" | "right";
  /** Current chip configuration (undefined when no chip). */
  currentChip?: WidgetChip;
  /** Current time period override (undefined when following dashboard). */
  currentTimePeriod?: TimePeriod;
  /** Current gauge target (undefined when using SEED default). */
  currentTarget?: number;
}) {
  // Controlled menu state — every selection (Edit / Bind / Unbind /
  // Remove) explicitly closes the dropdown. Previously we used
  // `e.preventDefault()` in onSelect to stop Radix's default close
  // behaviour (so the menu could survive a dialog mount), but that
  // left it hovering over the modal — exactly the bug.
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [, startTransition] = useTransition();

  function pick(action: () => void) {
    setMenuOpen(false);
    // Defer to the next tick so the dropdown's exit animation can
    // start before the dialog mounts; otherwise Radix's focus
    // management briefly fights with the dialog's autofocus.
    setTimeout(action, 0);
  }

  return (
    <>
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
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
              minWidth: 220,
              zIndex: 100,
            }}
          >
            <DropdownMenu.Item
              onSelect={() => pick(() => setEditOpen(true))}
              style={menuItemStyle("normal")}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <Icons.Edit size={14} /> Edit widget…
            </DropdownMenu.Item>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <DropdownMenu.Item
              onSelect={() => pick(() => setPickerOpen(true))}
              style={menuItemStyle("primary")}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <Icons.Plug size={14} /> {hasBinding ? "Change query" : "Bind a query"}
            </DropdownMenu.Item>
            {hasBinding && (
              <DropdownMenu.Item
                onSelect={() =>
                  pick(() =>
                    startTransition(async () => {
                      await bindWidget(dashboardId, widgetId, null);
                    }),
                  )
                }
                style={menuItemStyle("normal")}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <Icons.Close size={14} /> Unbind
              </DropdownMenu.Item>
            )}
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <DropdownMenu.Item
              onSelect={() =>
                pick(() => {
                  if (!confirm(`Remove this ${widgetType} widget?`)) return;
                  startTransition(async () => {
                    await removeWidget(dashboardId, widgetId);
                  });
                })
              }
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
      <EditWidgetDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        dashboardId={dashboardId}
        widgetId={widgetId}
        widgetType={widgetType}
        currentTitle={currentTitle}
        currentTitleSize={currentTitleSize}
        currentTitleAlign={currentTitleAlign}
        currentChip={currentChip}
        currentTimePeriod={currentTimePeriod}
        currentTarget={currentTarget}
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
