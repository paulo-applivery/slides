import { formatDistanceToNow } from "date-fns";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { getStripeIntegration } from "@/lib/integrations/stripe";
import { getHubspotIntegration } from "@/lib/integrations/hubspot";
import { canEdit, type Role } from "@/lib/roles";
import { StripeConnectForm } from "@/components/integrations/StripeConnectForm";
import { StripeActions } from "@/components/integrations/StripeActions";
import { HubspotConnectForm } from "@/components/integrations/HubspotConnectForm";
import { HubspotActions } from "@/components/integrations/HubspotActions";
import { HubspotFieldsPanel } from "@/components/integrations/HubspotFieldsPanel";
import { getHubspotFieldSelection } from "@/lib/integrations/hubspot";
import { fmtInt } from "@/lib/format";

/**
 * Integration cards page — currently Stripe is live, HubSpot is a stub.
 *
 * Each card shows: connection status, last sync, record count, partner
 * brand color band, contextual actions. Editors + admins see the action
 * buttons; viewers see a read-only status summary.
 */
export default async function IntegrationsPage() {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const role = (session.user.role ?? null) as Role | null;
  const editable = canEdit(role);
  const [stripe, hubspot] = await Promise.all([
    getStripeIntegration(session.user.workspaceId),
    getHubspotIntegration(session.user.workspaceId),
  ]);

  return (
    <>
      <TopBar crumbs={[]} name="Integrations" />
      <main className="main">
        <p
          className="t-body"
          style={{
            color: "var(--text-tertiary)",
            margin: "0 0 24px",
            maxWidth: 640,
          }}
        >
          Connect your revenue stack to populate dashboards with live data. The
          sync engine refreshes every 5 minutes once an integration is active.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 16,
          }}
        >
          {/* Stripe */}
          <IntegrationCard
            brandColor="var(--stripe)"
            providerName="Stripe"
            description="Charges, subscriptions, customers. Used for revenue and churn metrics."
            connected={!!stripe}
            status={stripe?.status ?? "disconnected"}
            lastSyncedAt={stripe?.lastSyncedAt ?? null}
            recordCount={stripe?.recordCount ?? 0}
            mode={stripe?.config?.stripeMode ?? null}
            errorMessage={stripe?.lastError?.message ?? null}
            connectSlot={editable ? <StripeConnectForm /> : null}
            connectedActions={editable ? <StripeActions /> : null}
          />
          {/* HubSpot */}
          <IntegrationCard
            brandColor="var(--hubspot)"
            providerName="HubSpot"
            description="Contacts, deals, owners, pipelines. Powers the funnel and ranking widgets."
            connected={!!hubspot}
            status={hubspot?.status ?? "disconnected"}
            lastSyncedAt={hubspot?.lastSyncedAt ?? null}
            recordCount={hubspot?.recordCount ?? 0}
            mode={null}
            errorMessage={hubspot?.lastError?.message ?? null}
            connectSlot={editable ? <HubspotConnectForm /> : null}
            connectedActions={editable ? <HubspotActions /> : null}
            extraSlot={
              hubspot && editable ? (
                <HubspotFieldsPanel
                  initialSelection={getHubspotFieldSelection(hubspot)}
                />
              ) : null
            }
          />
        </div>
      </main>
    </>
  );
}

function IntegrationCard({
  brandColor,
  providerName,
  description,
  connected,
  status,
  lastSyncedAt,
  recordCount,
  mode,
  errorMessage,
  connectSlot,
  connectedActions,
  extraSlot,
}: {
  brandColor: string;
  providerName: string;
  description: string;
  connected: boolean;
  status: "active" | "error" | "disconnected";
  lastSyncedAt: Date | null;
  recordCount: number;
  mode: "test" | "live" | null;
  errorMessage: string | null;
  connectSlot: React.ReactNode;
  connectedActions: React.ReactNode;
  /** Optional inline content rendered below the actions row — e.g. the HubSpot field-picker panel. */
  extraSlot?: React.ReactNode;
}) {
  return (
    <div
      className="card card-emphasized"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 20,
        borderColor: connected ? "var(--border-brand)" : "var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: brandColor,
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontWeight: 500,
            fontFamily: "var(--font-mono)",
          }}
        >
          {providerName[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-h4">{providerName}</div>
          <div className="t-small">{description}</div>
        </div>
        <StatusBadge status={status} />
      </div>

      {connected && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            padding: "12px 0",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Stat label="Last sync" value={lastSyncedAt ? formatDistanceToNow(lastSyncedAt, { addSuffix: true }) : "never"} />
          <Stat label="Records" value={fmtInt(recordCount)} mono />
          <Stat label="Mode" value={mode ? mode : "—"} mono />
        </div>
      )}

      {errorMessage && (
        <p
          className="t-small"
          style={{
            color: "var(--danger)",
            background: "var(--danger-soft)",
            padding: "8px 12px",
            borderRadius: 10,
            margin: 0,
          }}
        >
          {errorMessage}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: connected ? "flex-end" : "flex-start" }}>
        {connected ? connectedActions : connectSlot}
      </div>
      {extraSlot}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "error" | "disconnected" }) {
  if (status === "active") {
    return (
      <span className="badge badge-success">
        <span className="dot" />
        Connected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="badge badge-danger">
        <span className="dot" />
        Error
      </span>
    );
  }
  return (
    <span className="badge">
      <span className="dot" style={{ background: "var(--text-muted)" }} />
      Not connected
    </span>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="t-micro">{label}</span>
      <span
        className={mono ? "t-mono" : undefined}
        style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: 14 }}
      >
        {value}
      </span>
    </div>
  );
}
