/**
 * Stripe integration — validate keys, sync charges, surface health.
 *
 * Phase 2 slice 1: API-key entry only. Stripe OAuth (Connect Standard) is a
 * later slice once we're configuring prod. Either auth method ends up as a
 * Bearer token in the `Authorization` header, so the sync code is
 * indifferent.
 */
import Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrations, stripeCharges } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

function client(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    // Let the SDK pin its bundled API version; we sync against whatever the
    // installed `stripe` package targets, so behavior matches its types.
    appInfo: { name: "Applivery Slides", version: "0.1.0" },
    // Fetch-based HTTP client so Node + Cloudflare Workers behave the same.
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Validate a Stripe key by hitting `Account.retrieve` and reading the
 * account id + livemode. Returns the metadata we persist into
 * `integrations.config`. Throws on auth failure / network / wrong key shape.
 */
export async function validateStripeKey(secretKey: string) {
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) {
    throw new Error(
      "Stripe secret keys start with `sk_` or `rk_` followed by `_test_` or `_live_`.",
    );
  }
  // In v22+ the SDK requires an explicit id argument; `null` means "the
  // account associated with this API key" — Standard and restricted-key
  // flows both resolve to the connected account.
  const acct = await client(secretKey).accounts.retrieve(null as unknown as string);
  return {
    stripeAccountId: acct.id,
    stripeMode: secretKey.includes("_live_") ? ("live" as const) : ("test" as const),
    displayName: acct.business_profile?.name ?? acct.email ?? acct.id,
  };
}

/**
 * Connect or replace a workspace's Stripe integration. Encrypts the key
 * before write. Idempotent — replays return the same row.
 */
export async function connectStripe(workspaceId: string, secretKey: string) {
  const meta = await validateStripeKey(secretKey);
  const enc = await encryptSecret(secretKey);

  await db
    .insert(integrations)
    .values({
      workspaceId,
      provider: "stripe",
      accessTokenEnc: enc,
      config: {
        stripeAccountId: meta.stripeAccountId,
        stripeMode: meta.stripeMode,
      },
      status: "active",
    })
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.provider],
      set: {
        accessTokenEnc: enc,
        config: {
          stripeAccountId: meta.stripeAccountId,
          stripeMode: meta.stripeMode,
        },
        status: "active",
        lastError: null,
      },
    });

  return meta;
}

export async function disconnectStripe(workspaceId: string) {
  await db
    .delete(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.provider, "stripe"),
      ),
    );
  await db
    .delete(stripeCharges)
    .where(eq(stripeCharges.workspaceId, workspaceId));
}

export async function getStripeIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.provider, "stripe"),
    ),
  });
}

/**
 * Sync charges from Stripe into the local mirror. Incremental: starts from
 * `last_synced_at - 10min` (overlap absorbs out-of-order events) on
 * subsequent runs.
 *
 * Returns the number of rows inserted/updated and the new total count.
 */
export async function syncStripeCharges(workspaceId: string) {
  const row = await getStripeIntegration(workspaceId);
  if (!row) throw new Error("Stripe is not connected for this workspace.");

  const key = await decryptSecret(row.accessTokenEnc);
  const stripe = client(key);

  // Determine the cursor. First sync = pull last 90 days; subsequent runs
  // use the overlap window so we catch retroactive status changes.
  const cursorMs = row.lastSyncedAt
    ? row.lastSyncedAt.getTime() - 10 * 60 * 1000
    : Date.now() - 90 * 24 * 60 * 60 * 1000;
  const createdGte = Math.floor(cursorMs / 1000);

  let upserted = 0;
  try {
    for await (const charge of stripe.charges.list({
      created: { gte: createdGte },
      limit: 100,
    })) {
      await db
        .insert(stripeCharges)
        .values({
          workspaceId,
          stripeId: charge.id,
          customerId:
            typeof charge.customer === "string"
              ? charge.customer
              : charge.customer?.id ?? null,
          amount: charge.amount,
          currency: charge.currency,
          status: charge.status,
          paid: charge.paid,
          refunded: charge.refunded,
          description: charge.description,
          occurredAt: new Date(charge.created * 1000),
        })
        .onConflictDoUpdate({
          target: [stripeCharges.workspaceId, stripeCharges.stripeId],
          set: {
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
            paid: charge.paid,
            refunded: charge.refunded,
            description: charge.description,
            syncedAt: new Date(),
          },
        });
      upserted++;
    }

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(stripeCharges)
      .where(eq(stripeCharges.workspaceId, workspaceId));
    const recordCount = Number(total[0]?.count ?? 0);

    await db
      .update(integrations)
      .set({
        status: "active",
        lastSyncedAt: new Date(),
        lastError: null,
        recordCount,
      })
      .where(eq(integrations.id, row.id));

    return { upserted, recordCount };
  } catch (err) {
    await db
      .update(integrations)
      .set({
        status: "error",
        lastError: {
          at: Date.now(),
          message: err instanceof Error ? err.message : String(err),
          status: err instanceof Stripe.errors.StripeError ? err.statusCode : undefined,
        },
      })
      .where(eq(integrations.id, row.id));
    throw err;
  }
}
