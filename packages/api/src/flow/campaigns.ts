import {
  archiveCampaign,
  stagePausedCampaign,
  writeAdCopy,
} from "@wovain/core/ads";
import type { WriteOnce } from "@wovain/core/ads";
import { withLlmTrace } from "@wovain/core/nemotron";
import { externalWrite } from "@wovain/db/schema/durable";
import { campaign } from "@wovain/db/schema/seller";
import { and, desc, eq, inArray, like } from "drizzle-orm";

import type { Actor } from "./actor";
import { notReady } from "./actor";
import { withProvider } from "./connections";
import { getDesign } from "./designs";
import { once } from "./once";
import { getProduct } from "./products";
import { charge } from "./spend";

// A published product gets varied ads in a PAUSED Meta campaign: the
// merchant reviews and starts it in Ads Manager.
//
// Staging takes 2 + 2n Meta writes. Each is keyed (./once), so a staging
// that fails partway resumes where it stopped when it is retried, and a run
// that fails for good archives what it staged (compensateRun).

export interface CampaignInput {
  adAccountId?: string | undefined;
  countries: string[];
  dailyBudget: number;
  pageId?: string | undefined;
  productId: string;
  // The caller's request ID; one campaign per product without it.
  requestId?: string | undefined;
}

const CAMPAIGN_WRITE = ":meta:campaign@";

const byKey = async ({ db, userId }: Actor, key: string) =>
  await db.query.campaign.findFirst({
    where: { idempotencyKey: key, userId },
  });

export const createProductCampaign = async (
  actor: Actor,
  input: CampaignInput
) => {
  const key = `campaign:${actor.userId}:${input.requestId ?? input.productId}`;
  const staged = await byKey(actor, key);
  if (staged !== undefined) {
    return staged;
  }
  const live = await getProduct(actor, input.productId);
  if (live.productUrl === null) {
    throw notReady({
      fix: "Publish the product before advertising it.",
      message: "The product isn't published",
    });
  }
  const linkUrl = live.productUrl;
  const source = await getDesign(actor, live.designId);
  const { runId } = source;
  // The copy is kept with the key too: a retry stages the same ads.
  const copy = await once(actor, {
    key: `${key}:copy`,
    operation: "ad_copy",
    perform: async () =>
      await charge(
        actor,
        "assist",
        { runId },
        async () =>
          await withLlmTrace(
            { distinctId: actor.userId, traceId: runId ?? source.id },
            async () =>
              await writeAdCopy(
                actor.core.nemotron,
                {
                  description: source.brief.description,
                  idea: source.brief.artPrompt,
                  title: source.brief.title,
                },
                actor.log
              )
          )
      ),
    provider: "nebius",
    runId,
  });
  const dailyBudgetCents = Math.round(input.dailyBudget * 100);
  const metaOnce: WriteOnce = async (name, perform, recover) =>
    await once(actor, {
      key: `${key}:meta:${name}`,
      operation: name,
      perform,
      provider: "meta",
      recover,
      runId,
    });
  const made = await withProvider(
    actor,
    "meta",
    async (call) =>
      await stagePausedCampaign(
        call,
        {
          adAccountId: input.adAccountId,
          copy,
          countries: input.countries,
          dailyBudgetCents,
          imageUrl: live.mockups[0] ?? source.artworkUrl,
          linkUrl,
          name: `wovain · ${source.brief.title}`,
          pageId: input.pageId,
          // Short and stable: it ends every object's name on Meta.
          tag: `w-${live.id.slice(0, 8)}`,
        },
        metaOnce
      )
  );
  await actor.db
    .insert(campaign)
    .values({
      adAccountId: made.adAccountId,
      adIds: made.adIds,
      adSetId: made.adSetId,
      copy,
      creativeIds: made.creativeIds,
      dailyBudgetCents,
      idempotencyKey: key,
      metaCampaignId: made.campaignId,
      pageId: made.pageId,
      productId: live.id,
      userId: actor.userId,
    })
    .onConflictDoNothing({ target: campaign.idempotencyKey });
  const row = await byKey(actor, key);
  if (row === undefined) {
    throw new Error("The campaign wasn't saved");
  }
  return row;
};

// The staging a Meta write belongs to: its key up to ":meta:".
const stagingKey = (writeKey: string) =>
  writeKey.split(":meta:")[0] ?? writeKey;

// After a run fails for good: archives each Meta campaign it began staging
// but never saved, so no half-built campaign is left on the merchant's
// account. Returns the archived campaign IDs.
export const compensateRun = async (actor: Actor, runId: string) => {
  const begun = await actor.db
    .select()
    .from(externalWrite)
    .where(
      and(
        eq(externalWrite.runId, runId),
        eq(externalWrite.provider, "meta"),
        eq(externalWrite.state, "done"),
        like(externalWrite.key, `%${CAMPAIGN_WRITE}%`)
      )
    );
  if (begun.length === 0) {
    return [];
  }
  const savedRows = await actor.db
    .select({ key: campaign.idempotencyKey })
    .from(campaign)
    .where(
      inArray(
        campaign.idempotencyKey,
        begun.map((row) => stagingKey(row.key))
      )
    );
  const saved = new Set(savedRows.map((row) => row.key));
  const orphans = begun.filter((row) => !saved.has(stagingKey(row.key)));
  if (orphans.length === 0) {
    return [];
  }
  return await withProvider(actor, "meta", async (call) => {
    const archived: string[] = [];
    for (const row of orphans) {
      const campaignId = String(row.result);
      const adAccountId = row.key.split(CAMPAIGN_WRITE)[1] ?? "";
      // oxlint-disable-next-line no-await-in-loop
      await archiveCampaign(call, { adAccountId, campaignId });
      // oxlint-disable-next-line no-await-in-loop
      await actor.db
        .update(externalWrite)
        .set({ state: "compensated" })
        .where(eq(externalWrite.key, row.key));
      archived.push(campaignId);
    }
    return archived;
  });
};

export const listCampaigns = async ({ db, userId }: Actor) =>
  await db
    .select()
    .from(campaign)
    .where(eq(campaign.userId, userId))
    .orderBy(desc(campaign.createdAt));
