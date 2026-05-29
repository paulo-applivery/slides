"use client";

import { useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icons } from "@/components/ui/Icon";
import {
  bindWidget,
  duplicateWidget,
  removeWidget,
} from "@/lib/dashboards";
import { toast } from "@/lib/toast";
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
  currentTextScale,
  currentTitleAlign,
  currentChip,
  currentTimePeriod,
  currentTarget,
  currentStages,
  currentFilters,
  currentFiltersByObject,
  currentText,
  currentImageUrl,
  currentImageFit,
  currentCard,
  boundQuerySource,
  boundQueryMetric,
  queriedScopes,
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
  /** Chart text-size multiplier, or undefined for the default (1×). */
  currentTextScale?: number;
  /** Current title alignment. */
  currentTitleAlign?: "left" | "center" | "right";
  /** Current chip configuration (undefined when no chip). */
  currentChip?: WidgetChip;
  /** Current time period override (undefined when following dashboard). */
  currentTimePeriod?: TimePeriod;
  /** Current gauge target (undefined when using SEED default). */
  currentTarget?: number;
  /**
   * Funnel-only: the configured stages (label + queryId per row). The
   * funnel widget binds queries per stage from the Edit dialog, so the
   * top-level "Bind a query" item is hidden when this is non-null.
   */
  currentStages?: Array<{
    id: string;
    label: string;
    queryId: string | null;
    dateField?: string;
    timePeriod?: TimePeriod;
    color?: string;
  }>;
  /**
   * Legacy per-widget filter overlay. Layered on top of the bound
   * query's own filters at execute time. Kept for widgets saved
   * before the per-object split; new saves go to
   * `currentFiltersByObject`.
   */
  currentFilters?: import("@/lib/queries/ast").Filter[];
  /**
   * Per-object filter overlay map. Each section in the dialog's
   * Filters tab edits one entry here, routed to queries whose
   * object matches at execute time.
   */
  currentFiltersByObject?: Partial<
    Record<
      import("@/lib/queries/catalog").SourceObject,
      import("@/lib/queries/ast").Filter[]
    >
  >;
  /** Text-widget content (text widgets only). */
  currentText?: string;
  /** Image-widget source URL (image widgets only). */
  currentImageUrl?: string;
  /** Image-widget object-fit (image widgets only). */
  currentImageFit?: "contain" | "cover";
  /** Static widgets: whether content renders inside card chrome. */
  currentCard?: boolean;
  /**
   * The bound query's source — feeds the filter editor's field menu so
   * a Stripe widget sees Stripe filters, a HubSpot widget sees HubSpot
   * filters. `undefined` when the widget isn't bound (filters tab is
   * disabled in that case — nothing to filter).
   */
  boundQuerySource?: "stripe" | "hubspot";
  /**
   * The bound query's metric id — feeds `objectFromMetricId` so the
   * filter editor narrows HubSpot fields to deals vs contacts based
   * on what the query is actually aggregating.
   */
  boundQueryMetric?: string;
  /**
   * Distinct (source, object) pairs the widget queries. Single
   * widgets pass one entry; funnels with mixed-source stages pass
   * one per object. The Filters tab renders one section per scope,
   * so a "Contacts created → Deals won" funnel gets a Contact
   * filters section + a Deal filters section.
   */
  queriedScopes?: Array<{
    source: "stripe" | "hubspot";
    object: import("@/lib/queries/catalog").SourceObject;
  }>;
}) {
  // Funnel binds per stage in the Edit dialog — hide the top-level
  // "Bind a query" / "Unbind" items so operators don't get a useless
  // single-query picker.
  const isFunnel = widgetType === "funnel";
  // Static widgets (text / image) carry no query — hide the bind/unbind
  // items the same way funnel does (funnel binds per-stage instead).
  const isStatic = widgetType === "text" || widgetType === "image";
  const showBinding = !isFunnel && !isStatic;
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
              <Icons.Edit size={14} />{" "}
              {isFunnel ? "Edit widget & stages…" : "Edit widget…"}
            </DropdownMenu.Item>
            {showBinding && (
              <>
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
                          try {
                            await bindWidget(dashboardId, widgetId, null);
                            toast.success({ title: "Query unbound" });
                          } catch (err) {
                            toast.error({
                              title: "Couldn't unbind query",
                              description: err instanceof Error ? err.message : undefined,
                            });
                          }
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
              </>
            )}
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <DropdownMenu.Item
              onSelect={() =>
                pick(() =>
                  startTransition(async () => {
                    try {
                      const res = await duplicateWidget(dashboardId, widgetId);
                      if (res) toast.success({ title: "Widget duplicated" });
                      else
                        toast.error({ title: "Couldn't duplicate widget" });
                    } catch (err) {
                      toast.error({
                        title: "Couldn't duplicate widget",
                        description: err instanceof Error ? err.message : undefined,
                      });
                    }
                  }),
                )
              }
              style={menuItemStyle("normal")}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elev-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <Icons.Plus size={14} /> Duplicate widget
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() =>
                pick(() => {
                  if (!confirm(`Remove this ${widgetType} widget?`)) return;
                  startTransition(async () => {
                    try {
                      await removeWidget(dashboardId, widgetId);
                      toast.success({ title: "Widget removed" });
                    } catch (err) {
                      toast.error({
                        title: "Couldn't remove widget",
                        description: err instanceof Error ? err.message : undefined,
                      });
                    }
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
        currentTextScale={currentTextScale}
        currentTitleAlign={currentTitleAlign}
        currentChip={currentChip}
        currentTimePeriod={currentTimePeriod}
        currentTarget={currentTarget}
        currentStages={currentStages}
        currentFilters={currentFilters}
        currentFiltersByObject={currentFiltersByObject}
        currentText={currentText}
        currentImageUrl={currentImageUrl}
        currentImageFit={currentImageFit}
        currentCard={currentCard}
        boundQuerySource={boundQuerySource}
        boundQueryMetric={boundQueryMetric}
        queriedScopes={queriedScopes}
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
