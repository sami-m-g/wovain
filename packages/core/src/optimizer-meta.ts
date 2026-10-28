import { z } from "zod";

import { conversationId } from "./ads";
import { amountOf } from "./insights";
import type { AdStats, MetaLearning } from "./optimizer";
import { findAll } from "./upstream";
import type { ToolCall } from "./upstream";

// What the ads optimizer reads from and writes to Meta, through the Meta
// Ads MCP server on the merchant's account (./optimizer). Replies are
// untrusted data: each field is parsed leniently, and a missing one leaves
// the optimizer on its own signals (wovain's saved budget, the 7-day result
// count) rather than guessing.

export interface CampaignRef {
  adAccountId: string;
  adIds: string[];
  adSetId: string;
  metaCampaignId: string;
}

export interface MetaCampaignRead {
  ads: AdStats[];
  // Meta's daily budget in cents, when it returned one.
  dailyBudgetCents?: number | undefined;
  live: boolean;
  metaLearning?: MetaLearning | undefined;
  resultsLast7d: number;
}

const CENTS = 100;
const ACTIVE = "ACTIVE";

const row = z.looseObject({ id: z.union([z.string().min(1), z.number()]) });
type Row = z.infer<typeof row>;

const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const statusOf = (entity: Row) =>
  text(entity.effective_status) ??
  text(entity.effectiveStatus) ??
  text(entity.status);

const rowsById = (reply: unknown, ids: readonly string[]) => {
  const wanted = new Set(ids);
  const found = new Map<string, Row>();
  for (const entity of findAll(row, reply)) {
    const id = String(entity.id);
    if (wanted.has(id) && !found.has(id)) {
      found.set(id, entity);
    }
  }
  return found;
};

const learningOf = (entity: Row | undefined): MetaLearning | undefined => {
  const info = entity?.learning_stage_info ?? entity?.learningStageInfo;
  const status =
    typeof info === "object" && info !== null
      ? text((info as Record<string, unknown>).status)
      : text(info);
  switch (status?.toUpperCase()) {
    case "LEARNING": {
      return "learning";
    }
    case "FAIL":
    case "LEARNING_LIMITED": {
      return "learning_limited";
    }
    case "SUCCESS": {
      return "success";
    }
    default: {
      return undefined;
    }
  }
};

const lookup = (
  call: ToolCall,
  ref: CampaignRef,
  args: Record<string, unknown>
) =>
  call("ads_get_ad_entities", {
    ad_account_id: ref.adAccountId,
    advertiser_job: "assess_and_optimize_performance",
    client_conversation_id: conversationId(`optimizer:${ref.metaCampaignId}`),
    reporting_purpose: ["metric_lookup"],
    ...args,
  });

// The campaign's status and budget, each ad's lifetime counts, and the ad
// set's learning stage and results over the last 7 days.
export const readCampaign = async (
  call: ToolCall,
  ref: CampaignRef
): Promise<MetaCampaignRead> => {
  const [campaigns, ads, adSets] = await Promise.all([
    lookup(call, ref, {
      date_preset: "maximum",
      fields: ["id", "effective_status", "daily_budget"],
      level: "campaign",
      object_ids: [ref.metaCampaignId],
    }),
    lookup(call, ref, {
      date_preset: "maximum",
      fields: [
        "id",
        "effective_status",
        "impressions",
        "clicks",
        "spend",
        "amount_spent",
      ],
      level: "ad",
      object_ids: ref.adIds,
    }),
    lookup(call, ref, {
      date_preset: "last_7d",
      fields: ["id", "results", "learning_stage_info"],
      level: "adset",
      object_ids: [ref.adSetId],
    }),
  ]);
  const campaign = rowsById(campaigns, [ref.metaCampaignId]).get(
    ref.metaCampaignId
  );
  const adRows = rowsById(ads, ref.adIds);
  const adSet = rowsById(adSets, [ref.adSetId]).get(ref.adSetId);
  // Meta's budgets are in the account's minor unit (cents for USD).
  const budget = amountOf(campaign?.daily_budget ?? campaign?.dailyBudget);
  return {
    ads: ref.adIds.map((adId) => {
      const ad = adRows.get(adId);
      return {
        active: ad !== undefined && statusOf(ad) === ACTIVE,
        adId,
        clicks: amountOf(ad?.clicks) ?? 0,
        impressions: amountOf(ad?.impressions) ?? 0,
        spendCents: Math.round(
          // Ad-level spend is the insights field `spend`; `amount_spent` is
          // the account field, kept in case the MCP maps it.
          (amountOf(ad?.spend ?? ad?.amount_spent ?? ad?.amountSpent) ?? 0) *
            CENTS
        ),
      };
    }),
    dailyBudgetCents: budget === undefined ? undefined : Math.round(budget),
    live: campaign !== undefined && statusOf(campaign) === ACTIVE,
    metaLearning: learningOf(adSet),
    resultsLast7d: amountOf(adSet?.results) ?? 0,
  };
};

const update = async (
  call: ToolCall,
  {
    adAccountId,
    entityId,
    entityType,
    fields,
  }: {
    adAccountId: string;
    entityId: string;
    entityType: "ad" | "campaign";
    fields: Record<string, unknown>;
  }
) =>
  await call("ads_update_entity", {
    ad_account_id: adAccountId,
    advertiser_job: "assess_and_optimize_performance",
    client_conversation_id: conversationId(`optimizer:${entityId}`),
    entity_id: entityId,
    entity_type: entityType,
    fields: JSON.stringify(fields),
  });

export const pauseAd = async (
  call: ToolCall,
  { adAccountId, adId }: { adAccountId: string; adId: string }
) =>
  await update(call, {
    adAccountId,
    entityId: adId,
    entityType: "ad",
    fields: { status: "PAUSED" },
  });

export const setCampaignBudget = async (
  call: ToolCall,
  {
    adAccountId,
    campaignId,
    dailyBudgetCents,
  }: { adAccountId: string; campaignId: string; dailyBudgetCents: number }
) =>
  await update(call, {
    adAccountId,
    entityId: campaignId,
    entityType: "campaign",
    fields: { daily_budget: dailyBudgetCents },
  });
