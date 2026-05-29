"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/Icon";
import {
  advanceHubspotSyncAction,
  disconnectHubspotAction,
  getHubspotSyncProgressAction,
  reimportHubspotAction,
  syncHubspotAction,
} from "@/lib/integrations/actions";
import type { HubspotSyncProgress } from "@/lib/integrations/hubspot";
import { toast } from "@/lib/toast";

function phaseLabel(p: HubspotSyncProgress): string {
  if (p.syncStatus === "queued") return "Queued…";
  switch (p.phase) {
    case "deals":
      return `Syncing deals… ${p.processedDeals.toLocaleString()}${p.totalDeals ? ` / ${p.totalDeals.toLocaleString()}` : ""}`;
    case "contacts":
      return `Syncing contacts… ${p.processedContacts.toLocaleString()}${p.totalContacts ? ` / ${p.totalContacts.toLocaleString()}` : ""}`;
    case "owners":
      return "Syncing owners…";
    default:
      return "Finishing…";
  }
}

export function HubspotActions() {
  const [syncing, startSync] = useTransition();
  const [reimporting, startReimport] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const [progress, setProgress] = useState<HubspotSyncProgress | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      setProgress(await getHubspotSyncProgressAction());
    } catch {
      // Transient (revalidation, auth race) — keep the last snapshot.
    }
  }, []);

  // Initial snapshot so a sync already running (e.g. from another tab or a
  // page reload mid-sync) shows progress immediately.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active =
    progress?.syncStatus === "queued" || progress?.syncStatus === "running";

  // While a sync is in flight, drive it from the browser: each tick processes
  // one bounded chunk server-side and returns the fresh progress. The open
  // page thus drains the queue itself (cron is only a backstop), so manual
  // "Sync now" / "Re-import all" make real progress regardless of the cron
  // window. Single-flight: the next tick is scheduled only after the previous
  // chunk resolves, so calls never overlap.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await advanceHubspotSyncAction();
        if (cancelled) return;
        setProgress(next);
      } catch {
        // Transient (revalidation, auth race) — retry on the next tick.
      }
      if (!cancelled) timer = setTimeout(() => void tick(), 1000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active]);

  // When a sync finishes (active → idle/error), refetch the server component
  // so the surrounding card's Last sync / Records / status reflect the row.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active) router.refresh();
    wasActive.current = active;
  }, [active, router]);

  const busy = active || syncing || reimporting;

  return (
    <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => {
            startSync(async () => {
              try {
                await syncHubspotAction();
                toast.success({
                  title: "HubSpot sync queued",
                  description: "Running in the background — progress shows here.",
                });
                await refresh();
              } catch (err) {
                toast.error({
                  title: "Couldn't queue sync",
                  description: err instanceof Error ? err.message : undefined,
                });
              }
            });
          }}
        >
          <Icons.Refresh size={14} /> {active ? "Syncing…" : "Sync now"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          title="Wipes the mirror and pulls every record from scratch — use when query counts don't match HubSpot."
          onClick={() => {
            if (
              !confirm(
                "Re-import all HubSpot data?\n\nThis wipes the local mirror and pulls every contact + deal from scratch. Runs in the background; large portals take several minutes.",
              )
            )
              return;
            startReimport(async () => {
              try {
                await reimportHubspotAction();
                toast.success({
                  title: "Re-import queued",
                  description: "Pulling every contact and deal fresh in the background.",
                });
                await refresh();
              } catch (err) {
                toast.error({
                  title: "Couldn't queue re-import",
                  description: err instanceof Error ? err.message : undefined,
                });
              }
            });
          }}
        >
          <Icons.Refresh size={14} /> {reimporting ? "Queuing…" : "Re-import all"}
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
                setProgress(null);
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
      {active && progress && (
        <div className="muted" style={{ fontSize: 12 }}>
          {phaseLabel(progress)}
        </div>
      )}
      {progress?.syncStatus === "error" && progress.error && (
        <div style={{ fontSize: 12, color: "var(--danger)" }}>
          Sync error: {progress.error}
        </div>
      )}
    </div>
  );
}
