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
};

export type BarDatum = { label: string; value: number; prev?: number };

export type FunnelStage = { label: string; value: number; formatted?: string };
