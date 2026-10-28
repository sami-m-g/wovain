import { createHash, randomInt } from "node:crypto";

import { z } from "zod";

import { judgeInstructions, judgePrompt, verdictSchema } from "./judges";
import type { Logger } from "./log";
import type { Nemotron } from "./nemotron";
import { findAll, findOne } from "./upstream";
import type { ToolCall } from "./upstream";

// Meta ads for a published product, through the Meta Ads MCP server on the
// merchant's own account: Nemotron writes varied ad copy, then wovain stages
// a traffic campaign with one ad set and one ad per variant. Everything is
// created PAUSED (or as a draft); wovain never activates spend.

export const copySchema = z.object({
  variants: z
    .array(
      z.object({
        // The angle this variant tries: humor, identity, gift, urgency…
        angle: z.string().min(1).max(40),
        headline: z.string().min(1).max(40),
        message: z.string().min(1).max(250),
      })
    )
    .min(2)
    .max(3),
});
export type AdCopy = z.infer<typeof copySchema>["variants"];

export const writeAdCopy = async (
  ask: Nemotron,
  product: { description: string; idea: string; title: string },
  log?: Logger
): Promise<AdCopy> => {
  const { variants } = await ask({
    grounded: (reply) =>
      reply.variants
        .map((variant) => `${variant.headline}\n${variant.message}`)
        .join("\n"),
    log,
    name: "ad_copy",
    prompt: JSON.stringify(product),
    schema: copySchema,
    system:
      "You write Meta ads for a print-on-demand t-shirt. Write 2 or 3 variants, each with a different angle, a headline under 40 characters and primary text under 250. No prices, no claims you can't back, no brand or celebrity names.",
    temperature: 0.8,
  });
  return variants;
};

// The ad judges every variant faces (./judges): a clear, honest angle, and
// Meta's rules on personal attributes and misleading claims.
const AD_JUDGES = ["ad_copy_quality", "meta_policy"] as const;
const PERCENT = 100;

export interface AdScore {
  // Share of passed judge verdicts across the variants, 0 to 100.
  score: number;
  verdicts: {
    critique: string;
    judge: (typeof AD_JUDGES)[number];
    pass: boolean;
    variant: number;
  }[];
}

// Each variant of the ad copy, judged by the binary ad judges on the fast
// model: the share of passes is the copy's score on the insights page.
export const scoreAdCopy = async (
  ask: Nemotron,
  { copy, title }: { copy: AdCopy; title: string },
  log?: Logger
): Promise<AdScore> => {
  const verdicts = await Promise.all(
    copy.flatMap((variant, index) =>
      AD_JUDGES.map(async (judge) => {
        const verdict = await ask({
          log,
          name: "ad_judge",
          prompt: judgePrompt(
            judge === "ad_copy_quality" ? { title } : {},
            variant
          ),
          schema: verdictSchema,
          system: judgeInstructions(judge),
          temperature: 0,
        });
        return {
          critique: verdict.critique,
          judge,
          pass: verdict.result === "Pass",
          variant: index,
        };
      })
    )
  );
  const passed = verdicts.filter((verdict) => verdict.pass).length;
  return {
    score:
      verdicts.length === 0
        ? 0
        : Math.round((passed / verdicts.length) * PERCENT),
    verdicts,
  };
};

export interface CampaignPlan {
  // Numeric, without "act_"; the merchant's first MCP-enabled account if unset.
  adAccountId?: string | undefined;
  copy: AdCopy;
  // ISO country codes the ad set targets.
  countries: string[];
  dailyBudgetCents: number;
  imageUrl: string;
  linkUrl: string;
  name: string;
  // The Page the ads run as; the ad account's first Page if unset.
  pageId?: string | undefined;
  // Stable across retries of one staging: it names every object, so an
  // object whose create got no answer can be found again on Meta.
  tag: string;
}

export interface StagedCampaign {
  adAccountId: string;
  adIds: string[];
  adSetId: string;
  campaignId: string;
  creativeIds: string[];
  pageId: string;
}

// Runs one create at most once per staging. `recover` looks for the object
// an earlier attempt may have made before it lost the answer. The default
// sends every create (a single, unretried staging).
export type WriteOnce = (
  name: string,
  perform: () => Promise<string>,
  recover?: () => Promise<string | undefined>
) => Promise<string>;

const sendEveryTime: WriteOnce = async (_name, perform) => await perform();

const CONVERSATION_ID_LENGTH = 20;
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Meta's MCP asks every call of one job to carry the same conversation id:
// derived from the seed, a retried job keeps its conversation.
export const conversationId = (seed?: string) => {
  if (seed === undefined) {
    return Array.from(
      { length: CONVERSATION_ID_LENGTH },
      () => ALPHABET[randomInt(ALPHABET.length)]
    ).join("");
  }
  const digest = createHash("sha256").update(seed).digest();
  return Array.from(
    digest.subarray(0, CONVERSATION_ID_LENGTH),
    (byte) => ALPHABET[byte % ALPHABET.length]
  ).join("");
};

const idField = (key: string) =>
  z.object({ [key]: z.union([z.string().min(1), z.number()]) });

const idOf = (reply: unknown, key: string) =>
  String(findOne(idField(key), reply, key)[key]);

const resolveAccount = async (call: ToolCall, given?: string) => {
  if (given !== undefined) {
    return given;
  }
  const [account] = findAll(
    z.object({
      ad_account_id: z.union([z.string(), z.number()]),
      is_ads_mcp_enabled: z.literal(true),
    }),
    await call("ads_get_ad_accounts", {})
  );
  if (account === undefined) {
    throw new Error("The merchant has no Meta ad account open to wovain");
  }
  return String(account.ad_account_id);
};

const resolvePage = async (
  call: ToolCall,
  adAccountId: string,
  given?: string
) =>
  given ??
  idOf(
    await call("ads_get_ad_account_pages", { ad_account_id: adAccountId }),
    "page_id"
  );

// The campaign, ad set or ad on the account whose name ends with `name`.
const findByName = async (
  call: ToolCall,
  adAccountId: string,
  level: "ad" | "adset" | "campaign",
  name: string
) => {
  const reply = await call("ads_get_ad_entities", {
    ad_account_id: adAccountId,
    date_preset: "maximum",
    fields: ["id", "name"],
    filtering: [{ field: "name", operator: "CONTAIN", value: [name] }],
    level,
    reporting_purpose: ["entity_lookup"],
  });
  return findAll(
    z.object({ id: z.union([z.string(), z.number()]), name: z.string() }),
    reply
  )
    .find((entity) => entity.name === name)
    ?.id.toString();
};

export const stagePausedCampaign = async (
  call: ToolCall,
  plan: CampaignPlan,
  once: WriteOnce = sendEveryTime
): Promise<StagedCampaign> => {
  const common = {
    advertiser_job: "create_and_launch_new_ads",
    client_conversation_id: conversationId(plan.tag),
  };
  const meta = async (tool: string, args: Record<string, unknown>) =>
    await call(tool, { ...common, ...args });
  const adAccountId = await resolveAccount(meta, plan.adAccountId);
  const pageId = await resolvePage(meta, adAccountId, plan.pageId);
  const account = { ad_account_id: adAccountId };
  const named = (suffix: string) => `${plan.name} · ${suffix} · ${plan.tag}`;
  const campaignName = named("campaign");
  // Named with its account, which archiving it again needs.
  const campaignId = await once(
    `campaign@${adAccountId}`,
    async () =>
      idOf(
        await meta("ads_create_campaign", {
          ...account,
          buying_type: "AUCTION",
          campaign_daily_budget: plan.dailyBudgetCents,
          campaign_name: campaignName,
          objective: "OUTCOME_TRAFFIC",
          special_ad_categories: "[]",
        }),
        "campaign_id"
      ),
    async () => await findByName(meta, adAccountId, "campaign", campaignName)
  );
  const adSetName = named("broad");
  const adSetId = await once(
    "ad_set",
    async () =>
      idOf(
        await meta("ads_create_ad_set", {
          ...account,
          ad_set_name: adSetName,
          billing_event: "IMPRESSIONS",
          campaign_id: campaignId,
          destination_type: "WEBSITE",
          optimization_goal: "LINK_CLICKS",
          targeting: JSON.stringify({
            geo_locations: { countries: plan.countries },
          }),
        }),
        "ad_set_id"
      ),
    async () => await findByName(meta, adAccountId, "adset", adSetName)
  );
  const creativeIds: string[] = [];
  const adIds: string[] = [];
  for (const [index, variant] of plan.copy.entries()) {
    const name = named(`${variant.angle} ${index + 1}`);
    // One at a time: Meta's draft takes its objects in order. A creative
    // made twice is harmless (it serves only through an ad), so it has no
    // lookup.
    // oxlint-disable-next-line no-await-in-loop
    const creativeId = await once(`creative:${index}`, async () =>
      idOf(
        await meta("ads_create_creative", {
          ...account,
          call_to_action_type: "SHOP_NOW",
          headline: variant.headline,
          image_url: plan.imageUrl,
          link_url: plan.linkUrl,
          message: variant.message,
          name,
          page_id: pageId,
        }),
        "creative_id"
      )
    );
    creativeIds.push(creativeId);
    // oxlint-disable-next-line no-await-in-loop
    const adId = await once(
      `ad:${index}`,
      async () =>
        idOf(
          await meta("ads_create_ad", {
            ...account,
            ad_name: name,
            ad_set_id: adSetId,
            creative: JSON.stringify({ creative_id: creativeId }),
          }),
          "ad_id"
        ),
      async () => await findByName(meta, adAccountId, "ad", name)
    );
    adIds.push(adId);
  }
  return { adAccountId, adIds, adSetId, campaignId, creativeIds, pageId };
};

// Undoes a staging that can't finish: archiving the campaign archives its ad
// sets and ads with it, so nothing is left behind on the merchant's account.
export const archiveCampaign = async (
  call: ToolCall,
  { adAccountId, campaignId }: { adAccountId: string; campaignId: string }
) => {
  await call("ads_update_entity", {
    ad_account_id: adAccountId,
    advertiser_job: "update_existing_campaigns",
    client_conversation_id: conversationId(campaignId),
    entity_id: campaignId,
    entity_type: "campaign",
    fields: JSON.stringify({ status: "ARCHIVED" }),
  });
};
