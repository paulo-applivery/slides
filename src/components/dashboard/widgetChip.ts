/**
 * Shared shape + curated palettes for the widget title-chip.
 *
 * Lives in its own file so the server action (server-only), the dialog
 * (client), and the renderer (server) can all import the type without
 * pulling client-only icon JSX through the boundary.
 */

/** Persisted shape on `widget.display.chip`. */
export type WidgetChip = {
  /**
   * Icon id, or undefined for no icon. Two accepted forms:
   *  - Full Iconify id from the picker, e.g. `solar:chart-2-bold`
   *  - Legacy `CHIP_ICONS` key (e.g. `TrendUp`) for chips saved before
   *    the full picker landed — `ChipIcon` renders both.
   */
  icon?: string;
  /** One of the keys in CHIP_COLORS. Drives bg tint + foreground colour. */
  color?: ChipColorKey;
  /** Visible label. Required. */
  text: string;
  /** Font-size in px. When unset, scales fluidly via cqh like the title. */
  size?: number;
};

/**
 * Curated icon set for the chip.
 *
 * Picked to cover the common labels an operator reaches for: time period
 * (Calendar), trend (TrendUp / ArrowUp / ArrowDown), source (Plug),
 * filter / tag (Filter / Star), visibility (Eye), and progress (Refresh).
 * Keep this list short — long lists turn the picker into a search problem.
 */
export const CHIP_ICONS = {
  none: { label: "None" },
  TrendUp: { label: "Trend up" },
  ArrowUp: { label: "Arrow up" },
  ArrowDown: { label: "Arrow down" },
  Calendar: { label: "Calendar" },
  Refresh: { label: "Refresh" },
  Filter: { label: "Filter" },
  Plug: { label: "Plug" },
  Eye: { label: "Eye" },
  Bell: { label: "Bell" },
  Settings: { label: "Settings" },
  TV: { label: "TV" },
} as const;

export type ChipIconKey = keyof typeof CHIP_ICONS;

/**
 * Colour palette. Each entry maps to a (background, foreground) pair —
 * background is a soft tint of the foreground so the chip reads as a
 * pill on light + dark surfaces.
 *
 * Keys are stable identifiers stored in DB; values may evolve.
 */
export const CHIP_COLORS = {
  neutral: { bg: "var(--bg-elev-2)", fg: "var(--text-secondary)" },
  primary: { bg: "var(--primary-soft)", fg: "var(--primary)" },
  success: { bg: "var(--success-soft, rgba(34,197,94,0.12))", fg: "var(--success)" },
  warning: { bg: "var(--warning-soft, rgba(251,191,36,0.16))", fg: "var(--warning)" },
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  brand: { bg: "var(--primary-soft)", fg: "var(--brand, var(--primary))" },
} as const;

export type ChipColorKey = keyof typeof CHIP_COLORS;
