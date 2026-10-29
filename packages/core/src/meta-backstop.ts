import { createHash } from "node:crypto";

import { targetsOf } from "./ad-rules";
import type { AdRuleSettings, UnitEconomics } from "./ad-rules";

// The Meta backstop (openspec meta-backstop): wovain's kill and stop rules
// mirrored into Meta's Automated Rules, so spend stops even when wovain is
// down. Meta checks them every 30 minutes on its side and pauses.
// https://developers.facebook.com/docs/marketing-api/ad-rules/overview/evaluation-spec
// https://developers.facebook.com/docs/marketing-api/ad-rules/guides/scheduled-based-rules
//
// Meta evaluates one ad or one campaign at a time and can't subtract
// profit, so the mirror is looser than wovain's own rules:
// - kills fire at BACKSTOP_SLACK times wovain's limits, so wovain acts first
//   and Meta only when wovain didn't;
// - the daily and monthly caps apply to each campaign alone (wovain's hold
//   across all campaigns);
// - the loss limit applies to a campaign's spend with no purchase at all.

export const BACKSTOP_PREFIX = "wovain backstop";
export const BACKSTOP_SLACK = 1.2;
const HASH_CHARS = 8;

export type BackstopRuleKind =
  | "kill_no_sale"
  | "kill_cart_no_sale"
  | "stop_daily_cap"
  | "stop_monthly_cap"
  | "stop_loss_limit";

interface Filter {
  field: string;
  operator: "EQUAL" | "GREATER_THAN" | "IN" | "LESS_THAN";
  value: number | string | string[];
}

export interface MetaRuleSpec {
  evaluation_spec: { evaluation_type: "SCHEDULE"; filters: Filter[] };
  execution_spec: { execution_type: "PAUSE" };
  schedule_spec: { schedule_type: "SEMI_HOURLY" };
}

export interface BackstopRule {
  kind: BackstopRuleKind;
  metaCampaignId: string;
  // The rule's name on Meta: the prefix, the campaign, the kind and a hash
  // of the spec, so a changed threshold is a new name.
  name: string;
  spec: MetaRuleSpec;
}

export interface BackstopCampaign {
  // The tightest product economics of the campaign (its lowest profit per
  // sale), or undefined when unknown.
  economics: UnitEconomics | undefined;
  metaCampaignId: string;
}

export interface BackstopCaps {
  dailySpendCapCents: number;
  monthlySpendCapCents: number;
}

const PURCHASES = "offsite_conversion.fb_pixel_purchase";
const ADD_TO_CARTS = "offsite_conversion.fb_pixel_add_to_cart";

const specOf = (filters: Filter[]): MetaRuleSpec => ({
  evaluation_spec: { evaluation_type: "SCHEDULE", filters },
  execution_spec: { execution_type: "PAUSE" },
  schedule_spec: { schedule_type: "SEMI_HOURLY" },
});

const hashOf = (spec: MetaRuleSpec) =>
  createHash("sha256")
    .update(JSON.stringify(spec))
    .digest("hex")
    .slice(0, HASH_CHARS);

const ruleOf = (
  metaCampaignId: string,
  kind: BackstopRuleKind,
  spec: MetaRuleSpec
): BackstopRule => ({
  kind,
  metaCampaignId,
  name: `${BACKSTOP_PREFIX} ${metaCampaignId} ${kind} ${hashOf(spec)}`,
  spec,
});

/** The Meta rules that mirror wovain's rules for one campaign. */
export const backstopRulesFor = (
  { economics, metaCampaignId }: BackstopCampaign,
  settings: AdRuleSettings,
  caps: BackstopCaps
): BackstopRule[] => {
  const ads: Filter[] = [
    { field: "entity_type", operator: "EQUAL", value: "AD" },
    { field: "campaign.id", operator: "IN", value: [metaCampaignId] },
    { field: "time_preset", operator: "EQUAL", value: "LIFETIME" },
  ];
  const campaign = (timePreset: string): Filter[] => [
    { field: "entity_type", operator: "EQUAL", value: "CAMPAIGN" },
    { field: "id", operator: "IN", value: [metaCampaignId] },
    { field: "time_preset", operator: "EQUAL", value: timePreset },
  ];
  const rules: BackstopRule[] = [];
  const targets =
    economics === undefined ? undefined : targetsOf(economics, settings);
  if (targets !== undefined) {
    const limit = (multiple: number) =>
      Math.round(targets.targetCpaCents * multiple * BACKSTOP_SLACK);
    rules.push(
      ruleOf(
        metaCampaignId,
        "kill_no_sale",
        specOf([
          ...ads,
          {
            field: "spent",
            operator: "GREATER_THAN",
            value: limit(settings.killNoSaleCpaMultiple),
          },
          { field: PURCHASES, operator: "LESS_THAN", value: 1 },
          { field: ADD_TO_CARTS, operator: "LESS_THAN", value: 1 },
        ])
      ),
      ruleOf(
        metaCampaignId,
        "kill_cart_no_sale",
        specOf([
          ...ads,
          {
            field: "spent",
            operator: "GREATER_THAN",
            value: limit(settings.killCartNoSaleCpaMultiple),
          },
          { field: PURCHASES, operator: "LESS_THAN", value: 1 },
        ])
      )
    );
  }
  if (caps.dailySpendCapCents > 0) {
    rules.push(
      ruleOf(
        metaCampaignId,
        "stop_daily_cap",
        specOf([
          ...campaign("TODAY"),
          {
            field: "spent",
            operator: "GREATER_THAN",
            value: caps.dailySpendCapCents,
          },
        ])
      )
    );
  }
  if (caps.monthlySpendCapCents > 0) {
    rules.push(
      ruleOf(
        metaCampaignId,
        "stop_monthly_cap",
        specOf([
          ...campaign("THIS_MONTH"),
          {
            field: "spent",
            operator: "GREATER_THAN",
            value: caps.monthlySpendCapCents,
          },
        ])
      )
    );
  }
  if (settings.lossLimitCents > 0) {
    rules.push(
      ruleOf(
        metaCampaignId,
        "stop_loss_limit",
        specOf([
          ...campaign("LIFETIME"),
          {
            field: "spent",
            operator: "GREATER_THAN",
            value: settings.lossLimitCents,
          },
          { field: PURCHASES, operator: "LESS_THAN", value: 1 },
        ])
      )
    );
  }
  return rules;
};

export const isBackstopRule = (name: string) =>
  name.startsWith(`${BACKSTOP_PREFIX} `);

export interface ExistingRule {
  id: string;
  name: string;
}

/**
 * What to change on Meta: create the rules that aren't there, and delete
 * wovain's rules that are no longer wanted (an old threshold, an ended
 * campaign). The merchant's own rules are never touched.
 */
export const planBackstop = (
  wanted: readonly BackstopRule[],
  existing: readonly ExistingRule[]
) => {
  const ours = existing.filter((rule) => isBackstopRule(rule.name));
  const have = new Set(ours.map((rule) => rule.name));
  const want = new Set(wanted.map((rule) => rule.name));
  return {
    create: wanted.filter((rule) => !have.has(rule.name)),
    remove: ours.filter((rule) => !want.has(rule.name)),
  };
};
