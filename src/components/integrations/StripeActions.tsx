"use client";

import { useState, useTransition } from "react";
import { Icons } from "@/components/ui/Icon";
import {
  disconnectStripeAction,
  syncStripeAction,
} from "@/lib/integrations/actions";

/** Connected-state actions: Sync Now + Disconnect. */
export function StripeActions() {
  const [syncing, startSync] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={syncing}
          onClick={() => {
            setSyncError(null);
            startSync(async () => {
              try {
                await syncStripeAction();
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
          disabled={disconnecting}
          onClick={() => {
            if (!confirm("Disconnect Stripe? Synced data will be removed.")) return;
            startDisconnect(async () => {
              await disconnectStripeAction();
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
