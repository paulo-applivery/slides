import { formatDistanceToNowStrict } from "date-fns";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { integrations } from "@/lib/db/schema";
import { fmtInt } from "@/lib/format";

/**
 * Live status of each connected integration, rendered as the bottom strip
 * of the sidebar. Re-fetched on every navigation (no client state).
 *
 * Server component — safe to call DB.
 */
export async function DataSourcesFooter() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) return null;

  const rows = await db
    .select({
      provider: integrations.provider,
      status: integrations.status,
      lastSyncedAt: integrations.lastSyncedAt,
      recordCount: integrations.recordCount,
    })
    .from(integrations)
    .where(eq(integrations.workspaceId, workspaceId));

  const byProvider = new Map(rows.map((r) => [r.provider, r] as const));

  return (
    <>
      <SyncRow
        providerName="Stripe"
        brandClass="brand-stripe"
        row={byProvider.get("stripe")}
        unitLabel="charges"
      />
      <SyncRow
        providerName="HubSpot"
        brandClass="brand-hubspot"
        row={byProvider.get("hubspot")}
        unitLabel="deals"
      />
    </>
  );
}

function SyncRow({
  providerName,
  brandClass,
  row,
  unitLabel,
}: {
  providerName: string;
  brandClass: string;
  row?: {
    status: "active" | "error" | "disconnected";
    lastSyncedAt: Date | null;
    recordCount: number;
  };
  unitLabel: string;
}) {
  const connected = !!row && row.status !== "disconnected";
  const errored = row?.status === "error";

  const dotClass = !connected ? "sb-sync-dot warn" : errored ? "sb-sync-dot warn" : "sb-sync-dot";
  const meta = !connected
    ? "not connected"
    : errored
      ? "sync error — see /integrations"
      : row?.lastSyncedAt
        ? `synced ${formatDistanceToNowStrict(row.lastSyncedAt, { addSuffix: true })} · ${fmtInt(row?.recordCount ?? 0)} ${unitLabel}`
        : `connected · ${fmtInt(row?.recordCount ?? 0)} ${unitLabel}`;

  return (
    <div className="sb-sync">
      <span
        className={dotClass}
        style={!connected ? { background: "var(--text-muted)", boxShadow: "none" } : undefined}
      />
      <span className="sb-sync-l">
        <span className={`sb-sync-name ${brandClass}`}>{providerName}</span>
        <span className="sb-sync-meta">{meta}</span>
      </span>
    </div>
  );
}
