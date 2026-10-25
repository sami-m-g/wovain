import { stagePausedCampaign, writeAdCopy } from "@wovain/core/ads";
import { withLlmTrace } from "@wovain/core/nemotron";
import { campaign } from "@wovain/db/schema/seller";
import { desc, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notReady } from "./actor";
import { withProvider } from "./connections";
import { getDesign } from "./designs";
import { getProduct } from "./products";

// A published product gets varied ads in a PAUSED Meta campaign: the
// merchant reviews and starts it in Ads Manager.

export interface CampaignInput {
  adAccountId?: string | undefined;
  countries: string[];
  dailyBudget: number;
  pageId?: string | undefined;
  productId: string;
}

export const createProductCampaign = async (
  actor: Actor,
  input: CampaignInput
) => {
  const live = await getProduct(actor, input.productId);
  if (live.productUrl === null) {
    throw notReady(
      "The product isn't published",
      "Publish the product before advertising it."
    );
  }
  const linkUrl = live.productUrl;
  const source = await getDesign(actor, live.designId);
  const copy = await withLlmTrace(
    { distinctId: actor.userId, traceId: source.runId ?? source.id },
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
  );
  const dailyBudgetCents = Math.round(input.dailyBudget * 100);
  const staged = await withProvider(
    actor,
    "meta",
    async (call) =>
      await stagePausedCampaign(call, {
        adAccountId: input.adAccountId,
        copy,
        countries: input.countries,
        dailyBudgetCents,
        imageUrl: live.mockups[0] ?? source.artworkUrl,
        linkUrl,
        name: `wovain · ${source.brief.title}`,
        pageId: input.pageId,
      })
  );
  const [row] = await actor.db
    .insert(campaign)
    .values({
      adAccountId: staged.adAccountId,
      adIds: staged.adIds,
      adSetId: staged.adSetId,
      copy,
      creativeIds: staged.creativeIds,
      dailyBudgetCents,
      metaCampaignId: staged.campaignId,
      pageId: staged.pageId,
      productId: live.id,
      userId: actor.userId,
    })
    .returning();
  if (row === undefined) {
    throw new Error("The campaign wasn't saved");
  }
  return row;
};

export const listCampaigns = async ({ db, userId }: Actor) =>
  await db
    .select()
    .from(campaign)
    .where(eq(campaign.userId, userId))
    .orderBy(desc(campaign.createdAt));
