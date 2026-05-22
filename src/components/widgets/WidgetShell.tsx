import type { ReactNode } from "react";
import { Icons } from "@/components/ui/Icon";
import { SourcePill } from "./SourcePill";
import type { DataSource } from "./types";

/**
 * Common chrome around every widget. Renders a header row (title +
 * subtitle + source pill + action), an optional hero "headline" block
 * (the big number that sits above chart-style children), the widget body,
 * and a "Live · updated …" footer.
 *
 * Title size is configurable per widget — the dashboard layout owns the
 * label and how prominent it should read. `headline` adds the hero number
 * above the chart for widgets where the chart alone doesn't carry the
 * top-line value (Bar, Funnel, Ranking). Gauge + SingleValue already
 * render their hero value inside the chart, so they leave it unset.
 */
export type WidgetShellProps = {
  title: string;
  subtitle?: string;
  /** Title font-size in px (default 13). Picked by layout config. */
  titleSize?: number;
  source?: DataSource;
  updated?: string;
  /** Big number rendered above the chart body. */
  headline?: string;
  /** Tiny caption under the headline (e.g. "total contacts"). */
  headlineCaption?: string;
  children: ReactNode;
  footer?: false;
  dragHandle?: boolean;
  action?: ReactNode;
};

export function WidgetShell({
  title,
  subtitle,
  titleSize,
  source,
  updated = "now",
  headline,
  headlineCaption,
  children,
  footer,
  dragHandle = true,
  action,
}: WidgetShellProps) {
  const titleStyle = titleSize ? { fontSize: titleSize } : undefined;
  return (
    <div className="widget">
      <header className="widget-head">
        <div className="widget-head-l">
          {dragHandle && (
            <span className="widget-drag" title="Drag">
              <Icons.Drag size={14} />
            </span>
          )}
          <div>
            <div className="widget-title" style={titleStyle}>
              {title}
            </div>
            {subtitle && <div className="widget-sub">{subtitle}</div>}
          </div>
        </div>
        <div className="widget-head-r">
          {source && <SourcePill source={source} />}
          {action ?? (
            <button className="widget-iconbtn" title="More">
              <Icons.More size={14} />
            </button>
          )}
        </div>
      </header>
      {(headline || headlineCaption) && (
        <div className="widget-headline">
          {headline && <div className="widget-headline-value">{headline}</div>}
          {headlineCaption && (
            <div className="widget-headline-caption">{headlineCaption}</div>
          )}
        </div>
      )}
      <div className="widget-body">{children}</div>
      {footer !== false && (
        <footer className="widget-foot">
          <span className="widget-foot-time">
            <span className="widget-foot-dot" /> Live · updated {updated}
          </span>
          <button className="widget-iconbtn" title="Refresh">
            <Icons.Refresh size={13} />
          </button>
        </footer>
      )}
    </div>
  );
}
