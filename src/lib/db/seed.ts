/**
 * Idempotent dev seed — runs against the local SQLite file.
 *
 * Creates / refreshes:
 *  - workspace "Volta Software" with domain "volta.so"
 *  - admin user "Pau Aragó" <paulo@volta.so>
 *  - dashboard "Q2 Revenue Pulse" (empty layout; widgets render from
 *    src/lib/seed.ts until Phase 2 wires real queries)
 *
 * Run with `pnpm db:seed`. Safe to run repeatedly — uses ON CONFLICT to
 * upsert.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./index";
import {
  dashboards,
  slideshows,
  users,
  workspaces,
  type DashboardLayout,
  type Slide,
} from "./schema";

async function main() {
  console.log("Seeding development data…");

  const DEMO_DOMAIN = "volta.so";
  const DEMO_USER_ID = "demo-user-pau";

  // 1) Workspace
  let workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.domain, DEMO_DOMAIN),
  });
  if (!workspace) {
    const id = randomUUID();
    await db.insert(workspaces).values({
      id,
      name: "Volta Software",
      domain: DEMO_DOMAIN,
      joinPolicy: "domain-auto",
    });
    workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, id) });
    if (!workspace) throw new Error("workspace insert failed");
    console.log(`  ✓ workspace created: ${workspace.id}`);
  } else {
    console.log(`  • workspace exists: ${workspace.id}`);
  }

  // 2) Demo user (stable id so reruns don't churn)
  await db
    .insert(users)
    .values({
      id: DEMO_USER_ID,
      email: "paulo@volta.so",
      name: "Pau Aragó",
      workspaceId: workspace.id,
      role: "admin",
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { name: "Pau Aragó", workspaceId: workspace.id, role: "admin" },
    });
  console.log(`  ✓ user upserted: ${DEMO_USER_ID}`);

  // 3) Dashboard — demo layout with all 5 widget types pre-populated so
  // the seeded board renders immediately (real grid editor lands in Phase 3).
  const demoLayout: DashboardLayout = {
    widgets: [
      {
        id: "kpi-mrr",
        type: "singleValue",
        queryId: null,
        pos: { x: 0, y: 0, w: 3, h: 1 },
        display: {
          title: "MRR",
          subtitle: "Monthly recurring revenue",
          seedKey: "mrr",
          unit: "€",
          period: "vs last month",
        },
      },
      {
        id: "kpi-arr",
        type: "singleValue",
        queryId: null,
        pos: { x: 3, y: 0, w: 3, h: 1 },
        display: {
          title: "ARR",
          subtitle: "Annual run rate",
          seedKey: "arr",
          unit: "€",
          period: "vs last month",
        },
      },
      {
        id: "kpi-churn",
        type: "singleValue",
        queryId: null,
        pos: { x: 6, y: 0, w: 3, h: 1 },
        display: {
          title: "Net Churn",
          subtitle: "Revenue lost / total",
          seedKey: "churn",
          unit: "%",
          period: "vs last month",
        },
      },
      {
        id: "kpi-newcust",
        type: "singleValue",
        queryId: null,
        pos: { x: 9, y: 0, w: 3, h: 1 },
        display: {
          title: "New customers",
          subtitle: "Closed-won this month",
          seedKey: "newCust",
          unit: "#",
          period: "vs last month",
        },
      },
      {
        id: "gauge-revenue",
        type: "gauge",
        queryId: null,
        pos: { x: 0, y: 1, w: 5, h: 2 },
        display: {
          title: "Q2 Revenue Target",
          titleSize: 20,
          subtitle: "Progress toward €500K goal",
          target: 500_000,
        },
      },
      {
        id: "bar-weekly",
        type: "bar",
        queryId: null,
        pos: { x: 5, y: 1, w: 7, h: 2 },
        display: {
          title: "New revenue by week",
          titleSize: 20,
          subtitle: "Last 8 weeks · current vs previous",
          headlineCaption: "total this period",
        },
      },
      {
        id: "funnel",
        type: "funnel",
        queryId: null,
        pos: { x: 0, y: 3, w: 7, h: 2 },
        display: {
          title: "Pipeline funnel",
          titleSize: 20,
          subtitle: "HubSpot deals · this month",
          headlineCaption: "new leads",
        },
      },
      {
        id: "ranking",
        type: "ranking",
        queryId: null,
        pos: { x: 7, y: 3, w: 5, h: 2 },
        display: {
          title: "Sales team ranking",
          titleSize: 20,
          subtitle: "Closed-won revenue · live",
          headlineCaption: "top performer",
        },
      },
    ],
  };

  const existing = await db.query.dashboards.findFirst({
    where: eq(dashboards.name, "Q2 Revenue Pulse"),
  });
  if (!existing) {
    const id = randomUUID();
    await db.insert(dashboards).values({
      id,
      workspaceId: workspace.id,
      name: "Q2 Revenue Pulse",
      createdBy: DEMO_USER_ID,
      layout: demoLayout,
    });
    console.log(`  ✓ dashboard created: ${id}`);
  } else {
    // Refresh layout in case the seed shape changed since the last seed.
    await db
      .update(dashboards)
      .set({ layout: demoLayout, updatedAt: new Date() })
      .where(eq(dashboards.id, existing.id));
    console.log(`  • dashboard exists: ${existing.id} (layout refreshed)`);
  }

  // 4) Slideshow — pre-populated with the demo dashboard so /tv works on day one.
  const dashboardRow = await db.query.dashboards.findFirst({
    where: eq(dashboards.name, "Q2 Revenue Pulse"),
  });
  if (dashboardRow) {
    const demoSlideshow = await db.query.slideshows.findFirst({
      where: and(
        eq(slideshows.name, "Office TV — Sales Floor"),
        eq(slideshows.workspaceId, workspace.id),
      ),
    });
    const slides: Slide[] = [
      {
        id: randomUUID(),
        type: "dashboard",
        dashboardId: dashboardRow.id,
        durationSec: 30,
        transition: "crossfade",
      },
    ];
    if (!demoSlideshow) {
      const id = randomUUID();
      await db.insert(slideshows).values({
        id,
        workspaceId: workspace.id,
        name: "Office TV — Sales Floor",
        createdBy: DEMO_USER_ID,
        slides,
      });
      console.log(`  ✓ slideshow created: ${id}`);
    } else {
      console.log(`  • slideshow exists: ${demoSlideshow.id}`);
    }
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
