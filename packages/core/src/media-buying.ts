import { z } from "zod";

import { conversationId } from "./ads";
import type { StagedCampaign } from "./ads";
import { findAll } from "./upstream";
import type { ToolCall } from "./upstream";

// Live media buying on the merchant's own Meta ad account (openspec change
// media-buying-live). wovain stages campaigns that cannot spend, reads them
// back to prove it, and takes them live only after an approval, inside the
// merchant's caps (@wovain/core/approvals decides; packages/api executes).
//
// Meta's Ads MCP stages every create in the account's Ads Manager draft
// (status DRAFT): the create tools take no status. Publishing the draft with
// `publish_as_active` is what goes live and spends. Accounts without draft
// mode get live objects created PAUSED instead; both are checked here.

// wovain's view of a Meta campaign's delivery.
export const CAMPAIGN_STATUSES = [
  "draft",
  "paused",
  "publishing",
  "in_review",
  "active",
  "with_issues",
  "archived",
  "unknown",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const meta =
  (call: ToolCall, seed: string, job: string) =>
  async (tool: string, args: Record<string, unknown>) =>
    await call(tool, {
      advertiser_job: job,
      client_conversation_id: conversationId(seed),
      ...args,
    });

// The Graph API list envelope of `ads_get_datasets`: the account's datasets
// (pixels) in the top-level `data`. Only that list counts: an id and a name
// nested elsewhere (an owner business, a creator) isn't a pixel.
const datasetList = z.object({
  data: z.array(
    z.object({ id: z.union([z.string(), z.number()]), name: z.string() })
  ),
});

// The account's pixel, when it has exactly one: with several, or a reply
// wovain can't read, it does not guess which one the shop fires.
export const findSalesPixel = async (call: ToolCall, adAccountId: string) => {
  const reply = await meta(
    call,
    adAccountId,
    "create_and_launch_new_ads"
  )("ads_get_datasets", { ad_account_id: adAccountId });
  const parsed = datasetList.safeParse(reply);
  if (!parsed.success) {
    return;
  }
  const ids = [...new Set(parsed.data.data.map((pixel) => String(pixel.id)))];
  return ids.length === 1 ? ids[0] : undefined;
};

const draftIds = async (
  call: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
  {
    adAccountId,
    campaignId,
  }: Pick<StagedCampaign, "adAccountId" | "campaignId">
) =>
  new Set(
    findAll(
      z.object({ ad_object_id: z.union([z.string(), z.number()]) }),
      await call("ads_get_ad_entities", {
        ad_account_id: adAccountId,
        object_ids: [campaignId],
        object_state: "draft",
      })
    ).map((entity) => String(entity.ad_object_id))
  );

const liveEntity = z.object({
  effective_status: z.string().optional(),
  id: z.union([z.string(), z.number()]),
  status: z.string().optional(),
});

const liveStatuses = async (
  call: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
  adAccountId: string,
  level: "ad" | "adset" | "campaign",
  ids: string[]
) => {
  if (ids.length === 0) {
    return new Map<string, string | undefined>();
  }
  const reply = await call("ads_get_ad_entities", {
    ad_account_id: adAccountId,
    fields: ["id", "status", "effective_status"],
    level,
    object_ids: ids,
    reporting_purpose: ["entity_lookup"],
  });
  return new Map(
    findAll(liveEntity, reply).map((entity) => [
      String(entity.id),
      entity.status ?? entity.effective_status,
    ])
  );
};

export const pauseCampaign = async (
  call: ToolCall,
  {
    adAccountId,
    campaignId,
  }: Pick<StagedCampaign, "adAccountId" | "campaignId">
) => {
  // Status only: Meta applies it to the live object at once, even in draft
  // mode. Never activate afterwards (that could undo the pause).
  await meta(
    call,
    campaignId,
    "update_existing_campaigns"
  )("ads_update_entity", {
    ad_account_id: adAccountId,
    entity_id: campaignId,
    entity_type: "campaign",
    fields: JSON.stringify({ status: "PAUSED" }),
  });
};

// Proves a fresh staging cannot spend: every object is in the draft, or live
// and PAUSED. Anything else is paused at once and the staging fails.
export const verifyStagedPaused = async (
  call: ToolCall,
  staged: StagedCampaign
): Promise<{ state: "draft" | "paused" }> => {
  const ask = meta(call, staged.campaignId, "create_and_launch_new_ads");
  const inDraft = await draftIds(ask, staged);
  const levels = [
    ["campaign", [staged.campaignId]],
    ["adset", [staged.adSetId]],
    ["ad", staged.adIds],
  ] as const;
  const live = levels.map(
    ([level, ids]) => [level, ids.filter((id) => !inDraft.has(id))] as const
  );
  if (live.every(([, ids]) => ids.length === 0)) {
    return { state: "draft" };
  }
  const notPaused: string[] = [];
  for (const [level, ids] of live) {
    // oxlint-disable-next-line no-await-in-loop
    const statuses = await liveStatuses(ask, staged.adAccountId, level, ids);
    for (const id of ids) {
      if (statuses.get(id) !== "PAUSED") {
        notPaused.push(`${level} ${id}: ${statuses.get(id) ?? "missing"}`);
      }
    }
  }
  if (notPaused.length > 0) {
    await pauseCampaign(call, staged);
    throw new Error(
      `Meta objects were not paused after staging (${notPaused.join(", ")}); the campaign was paused`
    );
  }
  return { state: "paused" };
};

// Takes an approved campaign live. A draft is published whole, as active; a
// live paused campaign is activated top-down (Meta needs every level
// active). Meta answers PUBLISHING: read the status back to know more.
export const activateCampaign = async (
  call: ToolCall,
  staged: StagedCampaign
) => {
  const ask = meta(call, staged.campaignId, "create_and_launch_new_ads");
  const base = { ad_account_id: staged.adAccountId };
  const inDraft = await draftIds(ask, staged);
  if (inDraft.size > 0) {
    await ask("ads_activate_entity", {
      ...base,
      entity_id: staged.campaignId,
      entity_type: "campaign",
      object_ids: [...inDraft],
      publish_as_active: true,
    });
    return;
  }
  const order = [
    ["campaign", staged.campaignId],
    ["ad_set", staged.adSetId],
    ...staged.adIds.map((id) => ["ad", id] as const),
  ] as const;
  for (const [type, id] of order) {
    // oxlint-disable-next-line no-await-in-loop
    await ask("ads_activate_entity", {
      ...base,
      entity_id: id,
      entity_type: type,
    });
  }
};

const STATUS_OF: Record<string, CampaignStatus> = {
  ACTIVE: "active",
  ADSET_PAUSED: "paused",
  ARCHIVED: "archived",
  CAMPAIGN_PAUSED: "paused",
  DELETED: "archived",
  DISAPPROVED: "with_issues",
  DRAFT: "draft",
  IN_PROCESS: "in_review",
  PAUSED: "paused",
  PENDING_BILLING_INFO: "with_issues",
  PENDING_REVIEW: "in_review",
  PREAPPROVED: "in_review",
  PUBLISHING: "publishing",
  WITH_ISSUES: "with_issues",
};

export const campaignStatusOf = (effective: string): CampaignStatus =>
  STATUS_OF[effective] ?? "unknown";

// The campaign's delivery as Meta reports it now: live first, then the draft.
export const readCampaignStatus = async (
  call: ToolCall,
  staged: Pick<StagedCampaign, "adAccountId" | "campaignId">
): Promise<CampaignStatus> => {
  const ask = meta(call, staged.campaignId, "report_measure_or_look_up");
  const reply = await ask("ads_get_ad_entities", {
    ad_account_id: staged.adAccountId,
    fields: ["id", "status", "effective_status"],
    level: "campaign",
    object_ids: [staged.campaignId],
    reporting_purpose: ["entity_lookup"],
  });
  const found = findAll(liveEntity, reply).find(
    (entity) => String(entity.id) === staged.campaignId
  );
  const effective = found?.effective_status ?? found?.status;
  if (effective !== undefined) {
    return campaignStatusOf(effective);
  }
  const inDraft = await draftIds(ask, staged);
  return inDraft.has(staged.campaignId) ? "draft" : "unknown";
};
