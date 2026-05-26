/** Shared types for the widget library. */

export type DataSource = "stripe" | "hubspot" | "mixed";

export type Rep = {
  id: string;
  name: string;
  initials: string;
  color: string;
  value: number;
  target: number;
  delta: number;
  /** Pre-formatted display string (outputFormat-aware). */
  formatted?: string;
};

export type BarDatum = {
  label: string;
  value: number;
  prev?: number;
  /** Pre-formatted axis / tooltip label (outputFormat-aware). */
  formatted?: string;
};

export type FunnelStage = { label: string; value: number; formatted?: string };
