"use client";

import { useState, useTransition } from "react";
import { connectHubspotAction } from "@/lib/integrations/actions";
import { Icons } from "@/components/ui/Icon";
import { toast } from "@/lib/toast";

/**
 * HubSpot connect form — Private App access token entry.
 *
 * Create a Private App at: HubSpot → Settings → Integrations → Private Apps.
 * Required scopes: `crm.objects.deals.read`, `crm.objects.contacts.read`,
 * `crm.objects.owners.read`. The token looks like `pat-na1-…` or `pat-eu1-…`.
 */
export function HubspotConnectForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        <Icons.Plug size={14} /> Connect HubSpot
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await connectHubspotAction(undefined, formData);
          if (!res.ok) {
            toast.error({
              title: "Couldn't connect HubSpot",
              description: res.error ?? "Connection failed.",
            });
          } else {
            setOpen(false);
            toast.success({
              title: "HubSpot connected",
              description: "We're importing your contacts and deals now.",
            });
          }
        });
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "100%",
      }}
    >
      <label className="t-micro" htmlFor="hs-token">
        HubSpot Private App token
      </label>
      <input
        id="hs-token"
        name="accessToken"
        type="password"
        placeholder="pat-na1-…"
        autoComplete="off"
        autoFocus
        required
        style={{
          height: 38,
          padding: "0 12px",
          borderRadius: 10,
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
      />
      <p className="t-small" style={{ color: "var(--text-muted)", margin: 0 }}>
        Create one in HubSpot → Settings → Integrations → Private Apps.
        Required scopes:{" "}
        <code className="t-mono">crm.objects.deals.read</code>,{" "}
        <code className="t-mono">crm.objects.contacts.read</code>,{" "}
        <code className="t-mono">crm.objects.owners.read</code>.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Connecting…" : "Connect"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
