import type { BarDatum, FunnelStage, Rep } from "@/components/widgets/types";

/**
 * Seed data lifted from the prototype's screen-dashboard.jsx.
 *
 * Used to power the static dashboard until Phase 2 wires real queries against
 * Stripe + HubSpot mirror tables. Numbers are realistic European SaaS shapes
 * (€MRR, EU sales reps).
 */
export type Kpi = {
  value: number;
  delta: number;
  deltaPct: number;
  spark: number[];
};

export const SEED = {
  workspace: "Volta Software",
  dashboardName: "Q2 Revenue Pulse",
  user: { name: "Pau Aragó", initials: "PA" },
  range: "May 1 — May 20, 2026",

  gauge: { value: 387_420, target: 500_000 },

  bars: [
    { label: "W1", value: 58_400, prev: 49_200 },
    { label: "W2", value: 71_900, prev: 53_800 },
    { label: "W3", value: 64_300, prev: 60_100 },
    { label: "W4", value: 86_200, prev: 71_500 },
    { label: "W5", value: 92_700, prev: 67_900 },
    { label: "W6", value: 78_500, prev: 74_200 },
    { label: "W7", value: 104_600, prev: 80_400 },
    { label: "W8", value: 118_300, prev: 88_900 },
  ] satisfies BarDatum[],

  funnel: [
    { label: "New leads", value: 4128, formatted: "4,128" },
    { label: "Qualified MQLs", value: 1842, formatted: "1,842" },
    { label: "Open deals", value: 612, formatted: "612" },
    { label: "Closed won", value: 198, formatted: "198" },
  ] satisfies FunnelStage[],

  reps: [
    { id: "a", name: "Anaïs Petit", initials: "AP", color: "#5C8BFF", value: 94_300, target: 90_000, delta: 2 },
    { id: "b", name: "Tomás Quintana", initials: "TQ", color: "#FBBF24", value: 87_500, target: 90_000, delta: -1 },
    { id: "c", name: "Lina Sørensen", initials: "LS", color: "#4ADE80", value: 76_200, target: 90_000, delta: 1 },
    { id: "d", name: "Mateusz Wojcik", initials: "MW", color: "#F87171", value: 64_900, target: 90_000, delta: 0 },
    { id: "e", name: "Greta Bianchi", initials: "GB", color: "#A855F7", value: 58_400, target: 90_000, delta: -2 },
  ] satisfies Rep[],

  mrr: { value: 387_420, delta: 32_100, deltaPct: 9.0, spark: [320, 332, 341, 350, 358, 369, 371, 380, 387] } satisfies Kpi,
  arr: { value: 4_649_040, delta: 385_200, deltaPct: 9.0, spark: [3.9, 4.0, 4.1, 4.15, 4.22, 4.28, 4.35, 4.45, 4.65] } satisfies Kpi,
  churn: { value: 2.4, delta: -0.3, deltaPct: -11.1, spark: [3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.5, 2.4] } satisfies Kpi,
  newCust: { value: 38, delta: 12, deltaPct: 46.2, spark: [16, 20, 22, 24, 21, 26, 32, 38] } satisfies Kpi,
} as const;

export type SeedData = typeof SEED;
