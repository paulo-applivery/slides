"use client";

import { useState, useTransition } from "react";
import { Icons } from "@/components/ui/Icon";
import {
  disconnectHubspotAction,
  reimportHubspotAction,
  syncHubspotAction,
} from "@/lib/integrations/actions";

export function HubspotActions() {
  const [syncing, startSync] = useTransition();
  const [reimporting, startReimport] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={syncing || reimporting}
          onClick={() => {
            setSyncError(null);
            startSync(async () => {
              try {
                await syncHubspotAction();
              } catch (err) {
                setSyncError(err instanceof Error ? err.message : "Sync failed.");
              }
            });
          }}
        >
          <Icons.Refresh size={14} /> {syncing ? "Syncing…" : "Sync now"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={syncing || reimporting}
          title="Wipes the mirror and pulls every record from scratch — use when query counts don't match HubSpot."
          onClick={() => {
            if (
              !confirm(
                "Re-import all HubSpot data?\n\nThis wipes the local mirror and pulls every contact + deal from scratch. May take a few minutes for large portals.",
              )
            )
              return;
            setSyncError(null);
            startReimport(async () => {
              try {
                await reimportHubspotAction();
              } catch (err) {
                setSyncError(err instanceof Error ? err.message : "Re-import failed.");
              }
            });
          }}
        >
          <Icons.Refresh size={14} />{" "}
          {reimporting ? "Re-importing…" : "Re-import all"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={disconnecting}
          onClick={() => {
            if (!confirm("Disconnect HubSpot? Synced data will be removed.")) return;
            startDisconnect(async () => {
              await disconnectHubspotAction();
            });
          }}
          style={{ color: "var(--danger)", borderColor: "var(--danger-soft)" }}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
      {syncError && (
        <p className="t-small" style={{ color: "var(--danger)" }}>
          {syncError}
        </p>
      )}
    </div>
  );
}
