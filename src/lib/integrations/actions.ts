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
  enqueueHubspotSync,
  getHubspotSyncProgress,
  listHubspotProperties,
  runHubspotSyncChunk,
  syncRunsViaCron,
  updateHubspotFieldSelection,
} from "@/lib/integrations/hubspot";
import type { HubspotSyncProgress } from "@/lib/integrations/hubspot";

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

/**
 * Queue a HubSpot sync. On Cloudflare (D1) the Cron Trigger drains the queue,
 * so we return immediately and the UI polls progress. In local dev there's no
 * cron, so we drain the chunks inline here — preserving the old "click Sync,
 * see results" workflow. The chunk loop is idempotent + resumable either way.
 */
async function enqueueHubspotSyncAction(
  workspaceId: string,
  opts: { forceFull?: boolean } = {},
): Promise<void> {
  await enqueueHubspotSync(workspaceId, opts);
  if (syncRunsViaCron()) return;
  // Dev (better-sqlite3): no Worker cron — grind to completion now.
  let done = false;
  let guard = 0;
  while (!done && guard++ < 500) {
    done = (await runHubspotSyncChunk(workspaceId, { budgetMs: 60_000 })).done;
  }
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
    // Queue the first sync; on Cloudflare the cron tick grinds through it in
    // bounded chunks while the UI polls progress (a large portal can't be
    // pulled within one Worker invocation). In dev this drains inline.
    await enqueueHubspotSyncAction(workspaceId);
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

/** Queue an incremental sync; the cron tick processes it in chunks. */
export async function syncHubspotAction(): Promise<void> {
  const { workspaceId } = await requireEditor();
  await enqueueHubspotSyncAction(workspaceId);
  revalidatePath("/integrations");
  revalidatePath("/dashboards");
}

/**
 * Queue a full re-import.
 *
 * Wipes the mirror tables and re-pulls from cursor=0, so an existing
 * partial sync (whose `lastSyncedAt` would otherwise skip historical
 * records) gets a clean backfill. Used when the operator notices the
 * dashboard counts disagree with HubSpot and clicks "Re-import all".
 *
 * Backgrounded like the incremental sync — a large portal can't be pulled
 * within one Worker invocation, so the cron tick grinds through it in
 * bounded chunks while the UI polls progress.
 */
export async function reimportHubspotAction(): Promise<void> {
  const { workspaceId } = await requireEditor();
  await enqueueHubspotSyncAction(workspaceId, { forceFull: true });
  revalidatePath("/integrations");
  revalidatePath("/dashboards");
  revalidatePath("/queries");
}

/** Poll target for the /integrations UI while a sync runs. */
export async function getHubspotSyncProgressAction(): Promise<HubspotSyncProgress | null> {
  const { workspaceId } = await requireEditor();
  return getHubspotSyncProgress(workspaceId);
}

/**
 * Process ONE bounded chunk of a queued/running sync and return the latest
 * progress. The /integrations UI calls this on a loop while a sync is active,
 * so the open page drains the queue itself — each call is a fresh request
 * invocation, staying within the Worker's CPU/subrequest budget the same way
 * a cron tick does. This makes the manual "Sync now" / "Re-import all" buttons
 * actually do work in production (where `enqueueHubspotSyncAction` only queues
 * and returns), instead of waiting on the next business-hours cron tick. The
 * Cron Trigger remains a backstop for syncs whose tab was closed mid-run.
 *
 * No-ops (just returns progress) when the sync isn't queued/running, so a
 * stray poll can't kick off an unintended full pass.
 */
export async function advanceHubspotSyncAction(): Promise<HubspotSyncProgress | null> {
  const { workspaceId } = await requireEditor();
  const current = await getHubspotSyncProgress(workspaceId);
  if (
    !current ||
    (current.syncStatus !== "queued" && current.syncStatus !== "running")
  ) {
    return current;
  }
  const { done } = await runHubspotSyncChunk(workspaceId, { budgetMs: 12_000 });
  if (done) {
    revalidatePath("/integrations");
    revalidatePath("/dashboards");
    revalidatePath("/queries");
  }
  return getHubspotSyncProgress(workspaceId);
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
