"use client";

import { useTransition } from "react";
import { Icons } from "@/components/ui/Icon";
import {
  disconnectHubspotAction,
  reimportHubspotAction,
  syncHubspotAction,
} from "@/lib/integrations/actions";
import { toast } from "@/lib/toast";

export function HubspotActions() {
  const [syncing, startSync] = useTransition();
  const [reimporting, startReimport] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  return (
    <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={syncing || reimporting}
          onClick={() => {
            startSync(async () => {
              try {
                await syncHubspotAction();
                toast.success({ title: "HubSpot synced" });
              } catch (err) {
                toast.error({
                  title: "HubSpot sync failed",
                  description: err instanceof Error ? err.message : undefined,
                });
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
            startReimport(async () => {
              try {
                await reimportHubspotAction();
                toast.success({
                  title: "Re-import complete",
                  description: "Every contact and deal was pulled fresh.",
                });
              } catch (err) {
                toast.error({
                  title: "Re-import failed",
                  description: err instanceof Error ? err.message : undefined,
                });
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
              try {
                await disconnectHubspotAction();
                toast.success({ title: "HubSpot disconnected" });
              } catch (err) {
                toast.error({
                  title: "Couldn't disconnect HubSpot",
                  description: err instanceof Error ? err.message : undefined,
                });
              }
            });
          }}
          style={{ color: "var(--danger)", borderColor: "var(--danger-soft)" }}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    </div>
  );
}
