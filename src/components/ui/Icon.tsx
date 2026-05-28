import { type CSSProperties, type ReactNode } from "react";

/**
 * Solar-style line icons (1.5px stroke, currentColor). 24×24 viewBox.
 *
 * Migrated 1:1 from the prototype's icons.jsx. Long-term these resolve to
 * `@iconify-json/solar` Outline (default) + Bold (active state) — see
 * implementation-plan/libraries.md. For Phase 1 we ship the inline set so
 * we don't pay for a second icon font.
 */

type IconBaseProps = {
  size?: number;
  /** Toggles between Solar Outline (default) and Solar Bold (active state). */
  variant?: "outline" | "bold";
  stroke?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

type IconProps = IconBaseProps & {
  /** Either pass a single path `d`, or arbitrary SVG children. */
  d?: string;
  children?: ReactNode;
};

/** Internal SVG wrapper — every icon component spreads through here. */
const Icon = ({
  d,
  size = 18,
  variant = "outline",
  stroke = 1.5,
  children,
  className,
  style,
  title,
}: IconProps) => {
  const filled = variant === "bold";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {d ? <path d={d} /> : children}
    </svg>
  );
};

type IconComponentProps = Omit<IconBaseProps, "stroke"> & { stroke?: number };

export const Icons = {
  Dashboard: (p: IconComponentProps) => (
    <Icon {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  ),
  Slideshow: (p: IconComponentProps) => (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M10 9.5 14 12 10 14.5z" fill="currentColor" stroke="none" />
      <path d="M8 20h8" />
    </Icon>
  ),
  TV: (p: IconComponentProps) => (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 20h8" />
    </Icon>
  ),
  Query: (p: IconComponentProps) => (
    <Icon {...p}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </Icon>
  ),
  Plug: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5V8zM12 17v5" />
    </Icon>
  ),
  Settings: (p: IconComponentProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  ),
  Bell: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Icon>
  ),
  Plus: (p: IconComponentProps) => (
    <Icon {...p} d="M12 5v14M5 12h14" />
  ),
  Search: (p: IconComponentProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  ),
  Filter: (p: IconComponentProps) => <Icon {...p} d="M3 5h18M6 12h12M10 19h4" />,
  Calendar: (p: IconComponentProps) => (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Icon>
  ),
  Refresh: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="M3 12a9 9 0 0 1 15.6-6.1L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.6 6.1L3 16" />
      <path d="M3 21v-5h5" />
    </Icon>
  ),
  Share: (p: IconComponentProps) => (
    <Icon {...p}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </Icon>
  ),
  Grid: (p: IconComponentProps) => (
    <Icon {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </Icon>
  ),
  Drag: (p: IconComponentProps) => (
    <Icon {...p}>
      <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  ),
  More: (p: IconComponentProps) => (
    <Icon {...p}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  ),
  Close: (p: IconComponentProps) => <Icon {...p} d="M18 6 6 18M6 6l12 12" />,
  Copy: (p: IconComponentProps) => (
    <Icon {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  ),
  Edit: (p: IconComponentProps) => (
    <Icon {...p} d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  ),
  Check: (p: IconComponentProps) => <Icon {...p} d="m5 12 5 5 9-11" />,
  ChevronDown: (p: IconComponentProps) => <Icon {...p} d="m6 9 6 6 6-6" />,
  ChevronRight: (p: IconComponentProps) => <Icon {...p} d="m9 6 6 6-6 6" />,
  ChevronLeft: (p: IconComponentProps) => <Icon {...p} d="m15 6-6 6 6 6" />,
  ArrowUp: (p: IconComponentProps) => <Icon {...p} d="M12 19V5M5 12l7-7 7 7" />,
  ArrowDown: (p: IconComponentProps) => <Icon {...p} d="M12 5v14M19 12l-7 7-7-7" />,
  TrendUp: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </Icon>
  ),
  Play: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="M6 4 20 12 6 20z" fill="currentColor" stroke="none" />
    </Icon>
  ),
  Pause: (p: IconComponentProps) => (
    <Icon {...p}>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    </Icon>
  ),
  Globe: (p: IconComponentProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </Icon>
  ),
  Youtube: (p: IconComponentProps) => (
    <Icon {...p}>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
    </Icon>
  ),
  Eye: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  Save: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </Icon>
  ),
  Wifi: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="M5 12a10 10 0 0 1 14 0M2 8.5a15 15 0 0 1 20 0M8.5 15.5a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </Icon>
  ),
  Sun: (p: IconComponentProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Icon>
  ),
  Moon: (p: IconComponentProps) => (
    <Icon {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  ),
  Spark: (p: IconComponentProps) => (
    <Icon {...p}>
      <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </Icon>
  ),
};

export type IconName = keyof typeof Icons;

export default Icons;
