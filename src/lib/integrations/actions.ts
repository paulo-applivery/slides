"use server";

/**
 * Server actions for the /integrations page. Each enforces session + role
 * gating before touching credentials or calling provider APIs.
 */
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { canEdit, type Role } from "@/lib/roles";
import {
  connectStripe,
  disconnectStripe,
  syncStripeCharges,
} from "@/lib/integrations/stripe";
import {
  connectHubspot,
  disconnectHubspot,
  listHubspotProperties,
  syncHubspot,
  updateHubspotFieldSelection,
} from "@/lib/integrations/hubspot";

class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

async function requireEditor() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  const role = (session?.user?.role ?? null) as Role | null;
  if (!workspaceId || !canEdit(role)) throw new ForbiddenError();
  return { workspaceId };
}

/** Used by the connect form on /integrations. */
export async function connectStripeAction(
  _prev: { ok: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { workspaceId } = await requireEditor();
    const key = String(formData.get("apiKey") ?? "").trim();
    if (!key) return { ok: false, error: "Paste your Stripe secret key." };
    await connectStripe(workspaceId, key);
    revalidatePath("/integrations");
    // First-time sync runs immediately so the UI shows real numbers without
    // waiting on the next cron tick.
    await syncStripeCharges(workspaceId);
    revalidatePath("/integrations");
    revalidatePath("/dashboards");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed.",
    };
  }
}

export async function syncStripeAction(): Promise<void> {
  const { workspaceId } = await requireEditor();
  await syncStripeCharges(workspaceId);
  revalidatePath("/integrations");
  revalidatePath("/dashboards");
}

export async function disconnectStripeAction(): Promise<void> {
  const { workspaceId } = await requireEditor();
  await disconnectStripe(workspaceId);
  revalidatePath("/integrations");
  revalidatePath("/dashboards");
}

// ─────────────────────────────────────────────────────────────────────────────
// HubSpot
// ─────────────────────────────────────────────────────────────────────────────

export async function connectHubspotAction(
  _prev: { ok: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { workspaceId } = await requireEditor();
    const token = String(formData.get("accessToken") ?? "").trim();
    if (!token) return { ok: false, error: "Paste your HubSpot Private App token." };
    await connectHubspot(workspaceId, token);
    revalidatePath("/integrations");
    await syncHubspot(workspaceId);
    revalidatePath("/integrations");
    revalidatePath("/dashboards");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed.",
    };
  }
}

export async function syncHubspotAction(): Promise<void> {
  const { workspaceId } = await requireEditor();
  await syncHubspot(workspaceId);
  revalidatePath("/integrations");
  revalidatePath("/dashboards");
}

export async function disconnectHubspotAction(): Promise<void> {
  const { workspaceId } = await requireEditor();
  await disconnectHubspot(workspaceId);
  revalidatePath("/integrations");
  revalidatePath("/dashboards");
}

/**
 * Live-fetch the HubSpot property catalog so the field-picker UI can list
 * every available property (standard + custom). Cached by Next's RSC layer
 * for a few seconds since this is fired by user interaction on /integrations.
 */
export async function listHubspotPropertiesAction(): Promise<
  | { ok: true; properties: Awaited<ReturnType<typeof listHubspotProperties>> }
  | { ok: false; error: string }
> {
  try {
    const { workspaceId } = await requireEditor();
    const properties = await listHubspotProperties(workspaceId);
    return { ok: true, properties };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Persist the operator's field selection. Custom (non-syncable) field
 * names are dropped server-side — see `updateHubspotFieldSelection` for
 * the policy.
 */
export async function updateHubspotFieldSelectionAction(input: {
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
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { workspaceId } = await requireEditor();
    await updateHubspotFieldSelection(workspaceId, input);
    revalidatePath("/integrations");
    revalidatePath("/queries/new");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
