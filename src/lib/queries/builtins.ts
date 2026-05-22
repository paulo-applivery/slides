/**
 * Built-in query functions — Phase 2 slice 3.
 *
 * Each function fetches the data one widget needs, returning either the
 * widget's prop shape or `null` when the source isn't connected. The
 * dashboard page falls back to SEED values whenever a query returns null
 * so the surface always looks complete.
 *
 * A more general AST + builder UI (per implementation-plan/02) ships in
 * slice 4 once we know which shapes recur across customer setups.
 */
import { and, eq, gte, lt, sql, desc } from "drizzle-orm";
import {
  endOfMonth,
  startOfMonth,
  subMonths,
  startOfWeek,
  endOfWeek,
  subWeeks,
  formatISO,
} from "date-fns";
import { db } from "@/lib/db";
import {
  hubspotContacts,
  hubspotDeals,
  hubspotOwners,
  integrations,
  stripeCharges,
} from "@/lib/db/schema";
import type {
  BarDatum,
  FunnelStage,
  Rep,
} from "@/components/widgets/types";

// ─────────────────────────────────────────────────────────────────────────────
// Connection probes
// ─────────────────────────────────────────────────────────────────────────────

async function isProviderConnected(
  workspaceId: string,
  provider: "stripe" | "hubspot",
): Promise<boolean> {
  const row = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.provider, provider),
    ),
    columns: { id: true, status: true },
  });
  return !!row && row.status === "active";
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe-backed queries (amounts in cents → €)
// ─────────────────────────────────────────────────────────────────────────────

function centsToEuros(n: number | string | null | undefined): number {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return v / 100;
}

/** This-month revenue gauge — paid charges, sum / target (hardcoded). */
export async function gaugeRevenueTarget(
  workspaceId: string,
): Promise<{ value: number; target: number } | null> {
  if (!(await isProviderConnected(workspaceId, "stripe"))) return null;
  const monthStart = startOfMonth(new Date());

  const r = await db
    .select({ total: sql<number>`COALESCE(SUM(${stripeCharges.amount}), 0)` })
    .from(stripeCharges)
    .where(
      and(
        eq(stripeCharges.workspaceId, workspaceId),
        eq(stripeCharges.paid, true),
        gte(stripeCharges.occurredAt, monthStart),
      ),
    );

  return { value: centsToEuros(r[0]?.total ?? 0), target: 500_000 };
}

/** This-month vs last-month single value (acts as both MRR and ARR source). */
async function monthlyRevenue(workspaceId: string) {
  const now = new Date();
  const thisStart = startOfMonth(now);
  const lastStart = startOfMonth(subMonths(now, 1));
  const lastEnd = endOfMonth(subMonths(now, 1));

  const [thisRow, lastRow] = await Promise.all([
    db
      .select({ total: sql<number>`COALESCE(SUM(${stripeCharges.amount}), 0)` })
      .from(stripeCharges)
      .where(
        and(
          eq(stripeCharges.workspaceId, workspaceId),
          eq(stripeCharges.paid, true),
          gte(stripeCharges.occurredAt, thisStart),
        ),
      ),
    db
      .select({ total: sql<number>`COALESCE(SUM(${stripeCharges.amount}), 0)` })
      .from(stripeCharges)
      .where(
        and(
          eq(stripeCharges.workspaceId, workspaceId),
          eq(stripeCharges.paid, true),
          gte(stripeCharges.occurredAt, lastStart),
          lt(stripeCharges.occurredAt, lastEnd),
        ),
      ),
  ]);

  const thisTotal = centsToEuros(thisRow[0]?.total ?? 0);
  const lastTotal = centsToEuros(lastRow[0]?.total ?? 0);
  return { thisTotal, lastTotal };
}

export async function singleValueMrr(
  workspaceId: string,
): Promise<{
  value: number;
  delta: number;
  deltaPct: number;
  spark: number[];
} | null> {
  if (!(await isProviderConnected(workspaceId, "stripe"))) return null;
  const { thisTotal, lastTotal } = await monthlyRevenue(workspaceId);
  const delta = thisTotal - lastTotal;
  const deltaPct = lastTotal === 0 ? 0 : (delta / lastTotal) * 100;
  return { value: thisTotal, delta, deltaPct, spark: await monthlySparkline(workspaceId) };
}

export async function singleValueArr(
  workspaceId: string,
): Promise<{
  value: number;
  delta: number;
  deltaPct: number;
  spark: number[];
} | null> {
  if (!(await isProviderConnected(workspaceId, "stripe"))) return null;
  const { thisTotal, lastTotal } = await monthlyRevenue(workspaceId);
  // Simple annualization — Phase 2 slice 4 will replace this with subscription-based ARR
  // once we mirror the subscriptions table.
  const annualized = thisTotal * 12;
  const annualizedLast = lastTotal * 12;
  const delta = annualized - annualizedLast;
  const deltaPct = annualizedLast === 0 ? 0 : (delta / annualizedLast) * 100;
  return {
    value: annualized,
    delta,
    deltaPct,
    spark: (await monthlySparkline(workspaceId)).map((v) => v * 12),
  };
}

/** Distinct customers who paid this month vs last month. */
export async function singleValueNewCustomers(
  workspaceId: string,
): Promise<{
  value: number;
  delta: number;
  deltaPct: number;
  spark: number[];
} | null> {
  if (!(await isProviderConnected(workspaceId, "stripe"))) return null;
  const now = new Date();
  const thisStart = startOfMonth(now);
  const lastStart = startOfMonth(subMonths(now, 1));
  const lastEnd = endOfMonth(subMonths(now, 1));

  const [thisRow, lastRow] = await Promise.all([
    db
      .select({
        c: sql<number>`COUNT(DISTINCT ${stripeCharges.customerId})`,
      })
      .from(stripeCharges)
      .where(
        and(
          eq(stripeCharges.workspaceId, workspaceId),
          eq(stripeCharges.paid, true),
          gte(stripeCharges.occurredAt, thisStart),
        ),
      ),
    db
      .select({
        c: sql<number>`COUNT(DISTINCT ${stripeCharges.customerId})`,
      })
      .from(stripeCharges)
      .where(
        and(
          eq(stripeCharges.workspaceId, workspaceId),
          eq(stripeCharges.paid, true),
          gte(stripeCharges.occurredAt, lastStart),
          lt(stripeCharges.occurredAt, lastEnd),
        ),
      ),
  ]);

  const value = Number(thisRow[0]?.c ?? 0);
  const lastValue = Number(lastRow[0]?.c ?? 0);
  const delta = value - lastValue;
  const deltaPct = lastValue === 0 ? 0 : (delta / lastValue) * 100;
  return { value, delta, deltaPct, spark: await customerCountSparkline(workspaceId) };
}

/** Weekly revenue bars — last 8 weeks current vs previous 8 weeks. */
export async function barWeeklyRevenue(
  workspaceId: string,
): Promise<BarDatum[] | null> {
  if (!(await isProviderConnected(workspaceId, "stripe"))) return null;

  const now = new Date();
  const out: BarDatum[] = [];
  for (let i = 7; i >= 0; i--) {
    const wkStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const wkEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const prevStart = startOfWeek(subWeeks(now, i + 8), { weekStartsOn: 1 });
    const prevEnd = endOfWeek(subWeeks(now, i + 8), { weekStartsOn: 1 });

    const [cur, prev] = await Promise.all([
      sumChargesBetween(workspaceId, wkStart, wkEnd),
      sumChargesBetween(workspaceId, prevStart, prevEnd),
    ]);

    out.push({
      label: `W${8 - i}`,
      value: centsToEuros(cur),
      prev: centsToEuros(prev),
    });
  }
  return out;
}

async function sumChargesBetween(workspaceId: string, from: Date, to: Date) {
  const r = await db
    .select({ total: sql<number>`COALESCE(SUM(${stripeCharges.amount}), 0)` })
    .from(stripeCharges)
    .where(
      and(
        eq(stripeCharges.workspaceId, workspaceId),
        eq(stripeCharges.paid, true),
        gte(stripeCharges.occurredAt, from),
        lt(stripeCharges.occurredAt, to),
      ),
    );
  return Number(r[0]?.total ?? 0);
}

/** Last 9 months' revenue, for use in MRR/ARR sparklines. */
async function monthlySparkline(workspaceId: string): Promise<number[]> {
  const now = new Date();
  const points: number[] = [];
  for (let i = 8; i >= 0; i--) {
    const start = startOfMonth(subMonths(now, i));
    const end = endOfMonth(subMonths(now, i));
    points.push(centsToEuros(await sumChargesBetween(workspaceId, start, end)) / 1000);
  }
  return points;
}

async function customerCountSparkline(workspaceId: string): Promise<number[]> {
  const now = new Date();
  const points: number[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = startOfMonth(subMonths(now, i));
    const end = endOfMonth(subMonths(now, i));
    const r = await db
      .select({
        c: sql<number>`COUNT(DISTINCT ${stripeCharges.customerId})`,
      })
      .from(stripeCharges)
      .where(
        and(
          eq(stripeCharges.workspaceId, workspaceId),
          eq(stripeCharges.paid, true),
          gte(stripeCharges.occurredAt, start),
          lt(stripeCharges.occurredAt, end),
        ),
      );
    points.push(Number(r[0]?.c ?? 0));
  }
  return points;
}

// ─────────────────────────────────────────────────────────────────────────────
// HubSpot-backed queries
// ─────────────────────────────────────────────────────────────────────────────

const FUNNEL_STAGES: Array<{ label: string; lifecycleStage: string }> = [
  { label: "All contacts", lifecycleStage: "subscriber" },
  { label: "Leads", lifecycleStage: "lead" },
  { label: "Marketing qualified", lifecycleStage: "marketingqualifiedlead" },
  { label: "Customers", lifecycleStage: "customer" },
];

/**
 * Pipeline funnel from contact lifecycle stages.
 *
 * Each stage is counted as "contacts who reached this stage or further" so
 * the values decrease monotonically through the funnel, matching the visual.
 */
export async function funnelPipeline(
  workspaceId: string,
): Promise<FunnelStage[] | null> {
  if (!(await isProviderConnected(workspaceId, "hubspot"))) return null;

  // HubSpot's lifecyclestage values, in order of progression.
  const PROGRESSION = [
    "subscriber",
    "lead",
    "marketingqualifiedlead",
    "salesqualifiedlead",
    "opportunity",
    "customer",
    "evangelist",
  ];

  const result: FunnelStage[] = [];
  for (const stage of FUNNEL_STAGES) {
    const i = PROGRESSION.indexOf(stage.lifecycleStage);
    if (i === -1) continue;
    const later = PROGRESSION.slice(i);
    const r = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(hubspotContacts)
      .where(
        and(
          eq(hubspotContacts.workspaceId, workspaceId),
          sql`${hubspotContacts.lifecycleStage} IN (${sql.join(
            later.map((s) => sql`${s}`),
            sql`, `,
          )})`,
        ),
      );
    const value = Number(r[0]?.c ?? 0);
    result.push({ label: stage.label, value });
  }
  return result;
}

/** Top sales reps by closed-won deal value this month. */
export async function rankingTopReps(
  workspaceId: string,
  options?: { target?: number; limit?: number },
): Promise<Rep[] | null> {
  if (!(await isProviderConnected(workspaceId, "hubspot"))) return null;

  const target = options?.target ?? 90_000;
  const limit = options?.limit ?? 5;
  const monthStart = startOfMonth(new Date());

  // We sum deal amounts grouped by owner_id; deals are filtered to
  // closed-won and current month. Then we join with owners for display name.
  const rows = await db
    .select({
      ownerId: hubspotDeals.ownerId,
      total: sql<number>`COALESCE(SUM(CAST(${hubspotDeals.amount} AS REAL)), 0)`,
    })
    .from(hubspotDeals)
    .where(
      and(
        eq(hubspotDeals.workspaceId, workspaceId),
        eq(hubspotDeals.stage, "closedwon"),
        gte(hubspotDeals.closeDate, monthStart),
      ),
    )
    .groupBy(hubspotDeals.ownerId)
    .orderBy(desc(sql`total`))
    .limit(limit);

  if (rows.length === 0) return [];

  // Resolve owner names.
  const ownerIds = rows
    .map((r) => r.ownerId)
    .filter((id): id is string => !!id);
  const owners = ownerIds.length
    ? await db.query.hubspotOwners.findMany({
        where: and(
          eq(hubspotOwners.workspaceId, workspaceId),
          sql`${hubspotOwners.hsId} IN (${sql.join(
            ownerIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      })
    : [];
  const ownerById = new Map(owners.map((o) => [o.hsId, o] as const));

  const palette = ["#5C8BFF", "#FBBF24", "#4ADE80", "#F87171", "#A855F7"];

  return rows.map((r, i) => {
    const owner = r.ownerId ? ownerById.get(r.ownerId) : undefined;
    const name = owner
      ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email || "Unknown"
      : "Unassigned";
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
    return {
      id: r.ownerId ?? `row-${i}`,
      name,
      initials,
      color: palette[i % palette.length],
      value: Number(r.total ?? 0),
      target,
      delta: 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated fetch for the dashboard page
// ─────────────────────────────────────────────────────────────────────────────

export type DashboardData = {
  gauge: Awaited<ReturnType<typeof gaugeRevenueTarget>>;
  mrr: Awaited<ReturnType<typeof singleValueMrr>>;
  arr: Awaited<ReturnType<typeof singleValueArr>>;
  newCustomers: Awaited<ReturnType<typeof singleValueNewCustomers>>;
  bars: Awaited<ReturnType<typeof barWeeklyRevenue>>;
  funnel: Awaited<ReturnType<typeof funnelPipeline>>;
  reps: Awaited<ReturnType<typeof rankingTopReps>>;
  stripeConnected: boolean;
  hubspotConnected: boolean;
};

/** Fetch every widget's data in parallel for the demo dashboard. */
export async function fetchDashboardData(
  workspaceId: string,
): Promise<DashboardData> {
  const [
    stripeConnected,
    hubspotConnected,
    gauge,
    mrr,
    arr,
    newCustomers,
    bars,
    funnel,
    reps,
  ] = await Promise.all([
    isProviderConnected(workspaceId, "stripe"),
    isProviderConnected(workspaceId, "hubspot"),
    gaugeRevenueTarget(workspaceId),
    singleValueMrr(workspaceId),
    singleValueArr(workspaceId),
    singleValueNewCustomers(workspaceId),
    barWeeklyRevenue(workspaceId),
    funnelPipeline(workspaceId),
    rankingTopReps(workspaceId),
  ]);

  return {
    gauge,
    mrr,
    arr,
    newCustomers,
    bars,
    funnel,
    reps,
    stripeConnected,
    hubspotConnected,
  };
}

// Re-export for completeness; date-fns formatISO is unused but tree-shakeable.
export { formatISO };
