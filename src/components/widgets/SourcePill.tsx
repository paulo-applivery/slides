import type { DataSource } from "./types";

/** Tiny pill that identifies which integration sources a widget's data. */
const MAP: Record<DataSource, { label: string; color: string }> = {
  stripe: { label: "Stripe", color: "var(--stripe)" },
  hubspot: { label: "HubSpot", color: "var(--hubspot)" },
  mixed: { label: "Stripe + HubSpot", color: "var(--text-tertiary)" },
};

export function SourcePill({ source }: { source: DataSource }) {
  const s = MAP[source];
  return (
    <span className="src-pill" style={{ color: s.color }}>
      <span className="src-dot" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
