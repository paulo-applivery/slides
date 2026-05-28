"use client";

import { useTransition } from "react";
import { Icons } from "@/components/ui/Icon";
import {
  disconnectStripeAction,
  syncStripeAction,
} from "@/lib/integrations/actions";
import { toast } from "@/lib/toast";

/** Connected-state actions: Sync Now + Disconnect. */
export function StripeActions() {
  const [syncing, startSync] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  return (
    <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={syncing}
          onClick={() => {
            startSync(async () => {
              try {
                await syncStripeAction();
                toast.success({ title: "Stripe synced" });
              } catch (err) {
                toast.error({
                  title: "Stripe sync failed",
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
          disabled={disconnecting}
          onClick={() => {
            if (!confirm("Disconnect Stripe? Synced data will be removed.")) return;
            startDisconnect(async () => {
              try {
                await disconnectStripeAction();
                toast.success({ title: "Stripe disconnected" });
              } catch (err) {
                toast.error({
                  title: "Couldn't disconnect Stripe",
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
