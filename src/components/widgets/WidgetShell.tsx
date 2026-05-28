import type { ReactNode } from "react";
import { Icons } from "@/components/ui/Icon";
import { ChipIcon } from "@/components/ui/ChipIcon";
import {
  CHIP_COLORS,
  type WidgetChip,
} from "@/components/dashboard/widgetChip";

/**
 * Minimal widget chrome — title (+ optional chip) and chart.
 *
 * Per design: a chart widget should communicate **two things** at a glance —
 * what the chart represents (the title) and the chart itself. Everything
 * else (subtitle, source pill, DEMO/Live badge, hero number block above
 * the chart, "Live · updated now" footer) is either redundant with the
 * chart's own contents (the bar/gauge already carries its own labelling)
 * or noise that pulls the eye off the data.
 *
 * The optional `chip` renders as an inline pill next to the title — icon
 * + tinted background + coloured text — for operator-controlled labels
 * like "Q2", "live", "5-day trail". Its size is independently configurable
 * (defaults to scale with the widget like the title).
 *
 * The overflow menu (3-dot) keeps all the operational actions out of
 * sight until the operator wants them. The drag handle is hover-revealed
 * only in editor mode.
 */
export type WidgetShellProps = {
  title: string;
  /** Title font-size in px. When unset, scales fluidly via cqh. */
  titleSize?: number;
  /** Horizontal alignment of the title text within its flex slot. */
  titleAlign?: "left" | "center" | "right";
  /** Optional inline chip beside the title. */
  chip?: WidgetChip;
  /** Chart / value content rendered below the title. */
  children: ReactNode;
  /** Show the hover-revealed drag handle. Editor-only. */
  dragHandle?: boolean;
  /** The 3-dot overflow menu (editor-only). */
  action?: ReactNode;
};

export function WidgetShell({
  title,
  titleSize,
  titleAlign,
  chip,
  children,
  dragHandle = true,
  action,
}: WidgetShellProps) {
  const titleStyle: React.CSSProperties = {
    ...(titleSize ? { fontSize: titleSize } : {}),
    ...(titleAlign ? { textAlign: titleAlign } : {}),
  };
  return (
    <div className="widget">
      <header className="widget-head">
        <div className="widget-head-l">
          {dragHandle && (
            <span className="widget-drag" title="Drag">
              <Icons.Drag size={14} />
            </span>
          )}
          <div
            className="widget-title"
            style={Object.keys(titleStyle).length ? titleStyle : undefined}
          >
            {title}
          </div>
          {chip?.text ? <WidgetChipPill chip={chip} /> : null}
        </div>
        {action && <div className="widget-head-r">{action}</div>}
      </header>
      <div className="widget-body">{children}</div>
    </div>
  );
}

function WidgetChipPill({ chip }: { chip: WidgetChip }) {
  const palette = CHIP_COLORS[chip.color ?? "neutral"];
  // SVG icons want a numeric px; the chip's text scales via cqh by default,
  // so we pin the icon to the explicit size when given, otherwise default
  // to a sensible 14 px. The chip's auto sizing is driven by cqh in CSS.
  const iconSize = chip.size ? Math.max(10, Math.round(chip.size * 0.75)) : 14;
  const hasIcon = !!chip.icon && chip.icon !== "none";

  const styleVars = {
    "--chip-bg": palette.bg,
    "--chip-fg": palette.fg,
    fontSize: chip.size ? `${chip.size}px` : undefined,
  } as React.CSSProperties;

  return (
    <span className="widget-chip" style={styleVars}>
      {hasIcon ? <ChipIcon icon={chip.icon!} size={iconSize} /> : null}
      <span className="widget-chip-text">{chip.text}</span>
    </span>
  );
}
