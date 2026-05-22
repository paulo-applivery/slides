/**
 * HubSpot integration — validate Private App tokens, sync deals / contacts /
 * owners into local mirror tables.
 *
 * Phase 2 slice 2 supports Private App access tokens only (the modern,
 * simpler auth method; equivalent to Stripe's restricted keys). OAuth 2.0
 * for prod lands in a later slice once we configure the deploy URI.
 */
import { Client as HubSpotClient } from "@hubspot/api-client";
import type { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/deals";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  hubspotContacts,
  hubspotDeals,
  hubspotOwners,
  integrations,
} from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

function client(accessToken: string): HubSpotClient {
  return new HubSpotClient({ accessToken });
}

/**
 * Validate by hitting the account-info endpoint. Throws on bad token /
 * scope mismatch / network. Returns the portal id for `integrations.config`.
 */
export async function validateHubspotToken(accessToken: string) {
  if (!/^pat-(na1|eu1)-[a-f0-9-]+$/i.test(accessToken)) {
    throw new Error(
      "HubSpot Private App tokens look like `pat-na1-…` or `pat-eu1-…`.",
    );
  }
  const hs = client(accessToken);
  // `getInfo` returns { portalId, timeZone, accountType, ... }
  const info = await hs.settings.users.usersApi.getPage().catch(() => null);
  // Fall back to a lightweight call — listing 1 deal — if the users endpoint
  // isn't in scope. Token validity is confirmed either way.
  if (!info) {
    await hs.crm.deals.basicApi.getPage(1);
  }
  // Portal id isn't exposed by every endpoint in v13; we fetch it via the
  // account-info endpoint on the integrations namespace.
  const acct = await hs.apiRequest({
    method: "GET",
    path: "/integrations/v1/me",
  });
  const acctBody = (await acct.json()) as { portalId?: number };
  return {
    hubspotPortalId: acctBody.portalId,
  };
}

export async function connectHubspot(workspaceId: string, accessToken: string) {
  const meta = await validateHubspotToken(accessToken);
  const enc = await encryptSecret(accessToken);

  await db
    .insert(integrations)
    .values({
      workspaceId,
      provider: "hubspot",
      accessTokenEnc: enc,
      config: { hubspotPortalId: meta.hubspotPortalId },
      status: "active",
    })
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.provider],
      set: {
        accessTokenEnc: enc,
        config: { hubspotPortalId: meta.hubspotPortalId },
        status: "active",
        lastError: null,
      },
    });

  return meta;
}

export async function disconnectHubspot(workspaceId: string) {
  await db
    .delete(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.provider, "hubspot"),
      ),
    );
  // Cascade cleanup of mirror tables.
  await Promise.all([
    db.delete(hubspotDeals).where(eq(hubspotDeals.workspaceId, workspaceId)),
    db.delete(hubspotContacts).where(eq(hubspotContacts.workspaceId, workspaceId)),
    db.delete(hubspotOwners).where(eq(hubspotOwners.workspaceId, workspaceId)),
  ]);
}

export async function getHubspotIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.provider, "hubspot"),
    ),
  });
}

const DEAL_PROPS = [
  "dealname",
  "amount",
  "dealstage",
  "pipeline",
  "closedate",
  "hubspot_owner_id",
  "createdate",
  "hs_lastmodifieddate",
];

const CONTACT_PROPS = [
  "email",
  "hubspot_owner_id",
  "lifecyclestage",
  "createdate",
];

/**
 * Incremental sync. Cursor: `last_synced_at - 10min` on subsequent runs
 * (same overlap window as Stripe). First run pulls the trailing 90 days.
 */
export async function syncHubspot(workspaceId: string) {
  const row = await getHubspotIntegration(workspaceId);
  if (!row) throw new Error("HubSpot is not connected for this workspace.");

  const token = await decryptSecret(row.accessTokenEnc);
  const hs = client(token);

  const cursorMs = row.lastSyncedAt
    ? row.lastSyncedAt.getTime() - 10 * 60 * 1000
    : Date.now() - 90 * 24 * 60 * 60 * 1000;

  try {
    const [dealsCount, contactsCount, ownersCount] = await Promise.all([
      syncDeals(hs, workspaceId, cursorMs),
      syncContacts(hs, workspaceId, cursorMs),
      syncOwners(hs, workspaceId),
    ]);

    const recordCount = dealsCount + contactsCount + ownersCount;
    await db
      .update(integrations)
      .set({
        status: "active",
        lastSyncedAt: new Date(),
        lastError: null,
        recordCount,
      })
      .where(eq(integrations.id, row.id));

    return { deals: dealsCount, contacts: contactsCount, owners: ownersCount, recordCount };
  } catch (err) {
    await db
      .update(integrations)
      .set({
        status: "error",
        lastError: {
          at: Date.now(),
          message: err instanceof Error ? err.message : String(err),
        },
      })
      .where(eq(integrations.id, row.id));
    throw err;
  }
}

/** Page through deals modified since `cursorMs`, upsert into the mirror. */
async function syncDeals(hs: HubSpotClient, workspaceId: string, cursorMs: number) {
  let after: string | undefined;
  let total = 0;
  // HubSpot returns iso strings; we filter via the search API.
  const cursorIso = new Date(cursorMs).toISOString();

  // Limit of 100 per page; we cap at 50 pages (5000 deals) per sync run.
  for (let page = 0; page < 50; page++) {
    const res = await hs.crm.deals.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "hs_lastmodifieddate",
              operator: "GTE" as FilterOperatorEnum,
              value: cursorIso,
            },
          ],
        },
      ],
      properties: DEAL_PROPS,
      sorts: ["hs_lastmodifieddate"],
      limit: 100,
      after,
    });

    for (const d of res.results) {
      const p = d.properties;
      await db
        .insert(hubspotDeals)
        .values({
          workspaceId,
          hsId: d.id,
          name: p.dealname ?? null,
          amount: p.amount ?? null,
          stage: p.dealstage ?? null,
          pipeline: p.pipeline ?? null,
          ownerId: p.hubspot_owner_id ?? null,
          closeDate: p.closedate ? new Date(p.closedate) : null,
          createdAt: p.createdate ? new Date(p.createdate) : new Date(),
          updatedAt: p.hs_lastmodifieddate
            ? new Date(p.hs_lastmodifieddate)
            : new Date(),
        })
        .onConflictDoUpdate({
          target: [hubspotDeals.workspaceId, hubspotDeals.hsId],
          set: {
            name: p.dealname ?? null,
            amount: p.amount ?? null,
            stage: p.dealstage ?? null,
            pipeline: p.pipeline ?? null,
            ownerId: p.hubspot_owner_id ?? null,
            closeDate: p.closedate ? new Date(p.closedate) : null,
            updatedAt: p.hs_lastmodifieddate
              ? new Date(p.hs_lastmodifieddate)
              : new Date(),
            syncedAt: new Date(),
          },
        });
      total++;
    }

    after = res.paging?.next?.after;
    if (!after) break;
  }

  // Return cumulative count for the workspace, not just this run.
  const r = await db
    .select({ count: sql<number>`count(*)` })
    .from(hubspotDeals)
    .where(eq(hubspotDeals.workspaceId, workspaceId));
  return Number(r[0]?.count ?? total);
}

async function syncContacts(hs: HubSpotClient, workspaceId: string, cursorMs: number) {
  let after: string | undefined;
  const cursorIso = new Date(cursorMs).toISOString();

  for (let page = 0; page < 50; page++) {
    const res = await hs.crm.contacts.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "lastmodifieddate",
              operator: "GTE" as FilterOperatorEnum,
              value: cursorIso,
            },
          ],
        },
      ],
      properties: CONTACT_PROPS,
      sorts: ["lastmodifieddate"],
      limit: 100,
      after,
    });

    for (const c of res.results) {
      const p = c.properties;
      await db
        .insert(hubspotContacts)
        .values({
          workspaceId,
          hsId: c.id,
          email: p.email ?? null,
          ownerId: p.hubspot_owner_id ?? null,
          lifecycleStage: p.lifecyclestage ?? null,
          createdAt: p.createdate ? new Date(p.createdate) : new Date(),
        })
        .onConflictDoUpdate({
          target: [hubspotContacts.workspaceId, hubspotContacts.hsId],
          set: {
            email: p.email ?? null,
            ownerId: p.hubspot_owner_id ?? null,
            lifecycleStage: p.lifecyclestage ?? null,
            syncedAt: new Date(),
          },
        });
    }

    after = res.paging?.next?.after;
    if (!after) break;
  }

  const r = await db
    .select({ count: sql<number>`count(*)` })
    .from(hubspotContacts)
    .where(eq(hubspotContacts.workspaceId, workspaceId));
  return Number(r[0]?.count ?? 0);
}

/**
 * Owners is a tiny set (sales team size), so we full-sync each run rather
 * than paginate cleverly.
 */
async function syncOwners(hs: HubSpotClient, workspaceId: string) {
  const res = await hs.crm.owners.ownersApi.getPage(undefined, undefined, 100);
  for (const o of res.results) {
    if (!o.id) continue;
    await db
      .insert(hubspotOwners)
      .values({
        workspaceId,
        hsId: o.id,
        email: o.email ?? null,
        firstName: o.firstName ?? null,
        lastName: o.lastName ?? null,
      })
      .onConflictDoUpdate({
        target: [hubspotOwners.workspaceId, hubspotOwners.hsId],
        set: {
          email: o.email ?? null,
          firstName: o.firstName ?? null,
          lastName: o.lastName ?? null,
          syncedAt: new Date(),
        },
      });
  }
  return res.results.length;
}
