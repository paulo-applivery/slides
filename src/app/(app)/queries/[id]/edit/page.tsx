import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/shell/TopBar";
import { canEdit, type Role } from "@/lib/roles";
import { QueryWizard } from "@/components/queries/QueryWizard";
import { CLIENT_METRICS } from "@/lib/queries/catalog";
import { getQueryForEdit } from "@/lib/queries/actions";
import {
  getHubspotFieldSelectionWithFreshOptions,
  getHubspotIntegration,
} from "@/lib/integrations/hubspot";

/**
 * Edit page for a saved query. Loads the row, pre-fills the wizard via
 * its new `initial` prop. Save dispatches to `updateQueryAction` instead
 * of `createQueryAction`.
 */
export default async function EditQueryPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect("/login");

  const role = (session.user.role ?? null) as Role | null;
  if (!canEdit(role)) redirect("/queries");

  const query = await getQueryForEdit(params.id);
  if (!query) notFound();

  // Same per-source field-allow-list + custom-fields wiring as /queries/new.
  // Lazy on-demand backfill for enum options (see /queries/new for rationale).
  const hubspot = await getHubspotIntegration(session.user.workspaceId);
  const sel = hubspot
    ? await getHubspotFieldSelectionWithFreshOptions(session.user.workspaceId)
    : null;
  const hubspotAllowed = sel ? mapHubspotPropsToFieldIds(sel) : undefined;
  const hubspotCustomFields = sel ? buildCustomFields(sel) : [];
  const hubspotEnumOverrides = sel ? buildStandardEnumOverrides(sel) : {};

  return (
    <>
      <TopBar
        crumbs={["Queries"]}
        name={query.name}
      />
      <main className="main">
        <QueryWizard
          metrics={CLIENT_METRICS}
          allowedFieldsBySource={{ hubspot: hubspotAllowed }}
          customFieldsBySource={{ hubspot: hubspotCustomFields }}
          standardEnumOptionsBySource={{ hubspot: hubspotEnumOverrides }}
          initial={{
            id: query.id,
            name: query.name,
            config: query.config,
          }}
        />
      </main>
    </>
  );
}

function buildStandardEnumOverrides(sel: {
  deals: Array<{
    name: string;
    type: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  contacts: Array<{
    name: string;
    type: string;
    options?: Array<{ label: string; value: string }>;
  }>;
}): Record<string, Array<{ label: string; value: string }>> {
  const out: Record<string, Array<{ label: string; value: string }>> = {};
  const dealMap: Record<string, string> = {
    dealstage: "stage",
    pipeline: "pipeline",
    hubspot_owner_id: "ownerId",
  };
  const contactMap: Record<string, string> = {
    hubspot_owner_id: "ownerId",
    lifecyclestage: "lifecycleStage",
  };
  for (const f of sel.deals) {
    if (f.type !== "enumeration" || !f.options) continue;
    const id = dealMap[f.name];
    if (id) out[id] = f.options;
  }
  for (const f of sel.contacts) {
    if (f.type !== "enumeration" || !f.options) continue;
    const id = contactMap[f.name];
    if (id) out[id] = f.options;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicated from /queries/new/page.tsx — small enough to inline rather
// than carve a shared module. If this grows to a third caller we'll lift.
// ─────────────────────────────────────────────────────────────────────────────

function mapHubspotPropsToFieldIds(sel: {
  deals: { name: string }[];
  contacts: { name: string }[];
}): string[] {
  const dealMap: Record<string, string> = {
    amount: "amount",
    dealstage: "stage",
    pipeline: "pipeline",
    hubspot_owner_id: "ownerId",
  };
  const contactMap: Record<string, string> = {
    email: "email",
    hubspot_owner_id: "ownerId",
    lifecyclestage: "lifecycleStage",
  };
  return [
    ...sel.deals.map((f) => dealMap[f.name]).filter(Boolean),
    ...sel.contacts.map((f) => contactMap[f.name]).filter(Boolean),
    "count",
  ];
}

function buildCustomFields(sel: {
  deals: Array<{
    name: string;
    label: string;
    type: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  contacts: Array<{
    name: string;
    label: string;
    type: string;
    options?: Array<{ label: string; value: string }>;
  }>;
}) {
  const standardDeal = new Set([
    "dealname",
    "amount",
    "dealstage",
    "pipeline",
    "closedate",
    "hubspot_owner_id",
    "createdate",
  ]);
  const standardContact = new Set([
    "email",
    "hubspot_owner_id",
    "lifecyclestage",
    "createdate",
  ]);
  return [
    ...sel.deals
      .filter((f) => !standardDeal.has(f.name))
      .map((f) => ({
        id: `custom:${f.name}`,
        label: `Deal · ${f.label}`,
        type: f.type,
        options: f.options,
      })),
    ...sel.contacts
      .filter((f) => !standardContact.has(f.name))
      .map((f) => ({
        id: `custom:${f.name}`,
        label: `Contact · ${f.label}`,
        type: f.type,
        options: f.options,
      })),
  ];
}
