import {
  adAccountFor,
  archiveCampaign,
  scoreAdCopy,
  stagePausedCampaign,
  writeAdCopy,
} from "@wovain/core/ads";
import type { AdCopy, WriteOnce } from "@wovain/core/ads";
import { adCompetition } from "@wovain/core/competition";
import { findSalesPixel, verifyStagedPaused } from "@wovain/core/media-buying";
import { externalWrite } from "@wovain/db/schema/durable";
import { campaign } from "@wovain/db/schema/seller";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { log } from "evlog";

import type { Actor } from "./actor";
import { notReady } from "./actor";
import { withAgentTrace } from "./agent-trace";
import { audienceFor as brandAudienceFor } from "./audience";
import { audienceFor, qlooAudiencesOn } from "./audiences";
import { isCompetitionOn } from "./competition";
import { withProvider } from "./connections";
import { getDesign } from "./designs";
import { getIdea } from "./ideas";
import { isMediaBuyingLive } from "./media";
import { once } from "./once";
import { getProduct } from "./products";
import { charge } from "./spend";

// A published product gets varied ads in a PAUSED Meta campaign. Without
// the media-buying-live flag the merchant starts it in Ads Manager; with
// it, wovain reads the staging back and starts it only through the
// approval queue (./media).
//
// Staging takes 2 + 2n Meta writes. Each is keyed (./once), so a staging
// that fails partway resumes where it stopped when it is retried, and a run
// that fails for good archives what it staged (compensateRun).

export interface CampaignInput {
  adAccountId?: string | undefined;
  countries: string[];
  dailyBudget: number;
  pageId?: string | undefined;
  // The Meta pixel the shop fires (Fourthwall's Meta integration); the ad
  // account's only pixel if unset (media-buying-live).
  pixelId?: string | undefined;
  productId: string;
  // The caller's request ID; one campaign per product without it.
  requestId?: string | undefined;
}

const CAMPAIGN_WRITE = ":meta:campaign@";

const byKey = async ({ db, userId }: Actor, key: string) =>
  await db.query.campaign.findFirst({
    where: { idempotencyKey: key, userId },
  });

// Where a campaign's ad score is kept: next to its copy, under its key.
export const adScoreKey = (campaignKey: string) => `${campaignKey}:score`;

// With model routing on, the ad judges score the copy once per campaign
// (@wovain/core/ads scoreAdCopy); the insights page shows the score. A
// failed scoring leaves the campaign unscored and goes to error tracking:
// it doesn't stop the ads.
const scoreCopy = async (
  actor: Actor,
  {
    copy,
    key,
    runId,
    title,
    traceId,
  }: {
    copy: AdCopy;
    key: string;
    runId: string | null;
    title: string;
    traceId: string;
  }
) => {
  try {
    await withAgentTrace(actor, { runId, traceId }, async (routed) => {
      if (!routed) {
        return;
      }
      await once(actor, {
        key: adScoreKey(key),
        operation: "ad_score",
        perform: async () =>
          await scoreAdCopy(actor.core.nemotron, { copy, title }, actor.log),
        provider: "nebius",
        runId,
      });
    });
  } catch (error) {
    actor.log?.set({ adScore: { scored: false } });
    log.error({
      adScore: {
        key,
        reason: error instanceof Error ? error.message : String(error),
      },
      error: "AD_SCORE_FAILED",
    });
  }
};

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
  // Qloo's audience as the ad set's targeting and the copy's persona, kept
  // with the key so a retry stages the same ad set (./audiences).
  const audience = (await qlooAudiencesOn(actor))
    ? await once(actor, {
        key: `${key}:audience`,
        operation: "audience",
        perform: async () =>
          await audienceFor(actor, {
            countries: input.countries,
            runId: runId ?? undefined,
          }),
        provider: "meta",
        runId,
      })
    : undefined;
  // tavily-competition: the competitor angles the copy counter-positions.
  const competing = await isCompetitionOn(actor);
  const sourceIdea = competing
    ? await getIdea(actor, source.ideaId)
    : undefined;
  const competition = adCompetition(sourceIdea?.competition);
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
          await withAgentTrace(
            actor,
            { runId, traceId: runId ?? source.id },
            async () =>
              await writeAdCopy(
                actor.core.nemotron,
                {
                  description: source.brief.description,
                  idea: source.brief.artPrompt,
                  title: source.brief.title,
                },
                actor.log,
                audience?.persona,
                competition
              )
          )
      ),
    provider: "nebius",
    runId,
  });
  await scoreCopy(actor, {
    copy,
    key,
    runId,
    title: source.brief.title,
    traceId: runId ?? source.id,
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
  // Live media buying: the sales objective on the account's pixel, an
  // audience suggestion, UTM links, and a read-back proving nothing spends.
  const mediaBuying = await isMediaBuyingLive(actor);
  const targeting = mediaBuying
    ? await brandAudienceFor(actor, {
        countries: input.countries,
        productId: live.id,
      })
    : undefined;
  const { made, status } = await withProvider(actor, "meta", async (call) => {
    const plan = {
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
      // qloo-audiences: Qloo's ages, gender and interests as suggestions.
      targeting: audience?.targeting,
    };
    if (targeting === undefined) {
      return {
        made: await stagePausedCampaign(call, plan, metaOnce),
        status: "paused" as const,
      };
    }
    const adAccountId = await adAccountFor(call, plan.tag, input.adAccountId);
    const pixelId = input.pixelId ?? (await findSalesPixel(call, adAccountId));
    const stagedNow = await stagePausedCampaign(
      call,
      { ...plan, adAccountId, media: { pixelId, targeting } },
      metaOnce
    );
    // Throws (after pausing it) when anything came back able to spend.
    const verified = await verifyStagedPaused(call, stagedNow);
    return { made: stagedNow, status: verified.state };
  });
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
      status,
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
