import type {
  AdDayRow,
  CampaignRow,
  MetaAdRow,
} from "@wovain/shared/optimizer/snapshot";
import { parseAdName } from "@wovain/shared/rules";

import { num, str } from "../../lib/report-rows.ts";
import type { Row } from "../../lib/report-rows.ts";
import { stateOfReads } from "../../lib/upstream-rows.ts";
import { metaArgs } from "../read.ts";
import type { Call, Read } from "../read.ts";

// Meta insights on the merchant's own grant (spec section 2, Polling): one
// ad-level read with one row per ad per day (time_increment 1) for today and
// yesterday, and the campaign's budget and status. Meta refreshes insights
// about every 15 minutes, so the poll runs at that cadence while a campaign
// delivers. Without a Meta grant the optimizer is in check-in mode: the host
// agent passes the insights it read (optimizer_review), parsed by the same
// adDaysFrom.

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

// Fields checked against ads_get_ad_entities' catalog for level=ad.
const AD_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "effective_status",
  "amount_spent",
  "impressions",
  "link_click",
  "frequency",
  "omni_purchase",
  "omni_purchase_values",
];
const CAMPAIGN_FIELDS = ["id", "daily_budget", "effective_status"];

export interface MetaPoll {
  adDays: AdDayRow[];
  campaigns: CampaignRow[];
  // Something delivered today: polling stays on for 24 hours more.
  delivering: boolean;
  metaAds: MetaAdRow[];
  state: "connected" | "missing" | "error";
}

const whole = (value: number) => Math.max(0, Math.round(value));

// Insight rows as daily ad rows; rows without an ad id or a day are dropped.
export const adDaysFrom = (rows: Row[], at: number): AdDayRow[] =>
  rows.flatMap((row) => {
    const adId = str(row, "id", "ad_id");
    const date = str(row, "date_start", "date")?.slice(0, 10);
    if (adId === undefined || date === undefined || !DATE.test(date)) {
      return [];
    }
    const frequency = num(row, "frequency");
    return [
      {
        adId,
        at,
        clicks: whole(num(row, "link_click", "inline_link_clicks", "clicks")),
        date,
        impressions: whole(num(row, "impressions")),
        purchaseValue: Math.max(
          0,
          num(row, "omni_purchase_values", "purchase_value")
        ),
        purchases: whole(num(row, "omni_purchase", "purchases")),
        spend: Math.max(0, num(row, "amount_spent", "spend")),
        ...(frequency > 0 ? { frequency } : {}),
      },
    ];
  });

const metaAdsFrom = (rows: Row[], at: number): MetaAdRow[] => {
  const byId = new Map<string, MetaAdRow>();
  for (const row of rows) {
    const adId = str(row, "id", "ad_id");
    if (adId !== undefined) {
      byId.set(adId, {
        adId,
        at,
        campaignId: str(row, "campaign_id"),
        effectiveStatus: str(row, "effective_status")?.toUpperCase(),
        name: str(row, "name", "ad_name") ?? "",
      });
    }
  }
  return [...byId.values()];
};

// Budgets arrive in the account currency's minor unit (cents).
export const campaignsFrom = (rows: Row[], at: number): CampaignRow[] =>
  rows.flatMap((row) => {
    const campaignId = str(row, "id", "campaign_id");
    const cents = num(row, "daily_budget");
    return campaignId === undefined
      ? []
      : [
          {
            at,
            campaignId,
            effectiveStatus: str(row, "effective_status")?.toUpperCase(),
            ...(cents > 0 ? { dailyBudget: cents / 100 } : {}),
          },
        ];
  });

const rows = (read: Read) => (read.kind === "rows" ? read.rows : []);

const empty = (state: MetaPoll["state"]): MetaPoll => ({
  adDays: [],
  campaigns: [],
  delivering: false,
  metaAds: [],
  state,
});

export const pollMeta = async ({
  accountId,
  call,
  campaignId,
  now,
}: {
  accountId: string | undefined;
  call: Call;
  campaignId: string | undefined;
  now: number;
}): Promise<MetaPoll> => {
  if (accountId === undefined || campaignId === undefined) {
    return empty("missing");
  }
  const account = accountId.replace(/^act_/u, "");
  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - DAY).toISOString().slice(0, 10);
  const [ads, campaigns] = await Promise.all([
    call(
      "meta",
      "ads_get_ad_entities",
      metaArgs({
        ad_account_id: account,
        fields: AD_FIELDS,
        level: "ad",
        limit: 500,
        time_increment: "1",
        time_range: JSON.stringify({ since: yesterday, until: today }),
      })
    ),
    call(
      "meta",
      "ads_get_ad_entities",
      metaArgs({
        ad_account_id: account,
        fields: CAMPAIGN_FIELDS,
        level: "campaign",
        object_ids: [campaignId],
      })
    ),
  ]);
  const state = stateOfReads([ads, campaigns]);
  if (state !== "connected") {
    return empty(state);
  }
  // Only wovain's campaign: other campaigns in the account aren't ours. A
  // row without a campaign id counts when it carries a wovain ad name.
  const ours = rows(ads).filter((row) => {
    const campaign = str(row, "campaign_id");
    return campaign === undefined
      ? parseAdName(str(row, "name") ?? "") !== undefined
      : campaign === campaignId;
  });
  const adDays = adDaysFrom(ours, now);
  const campaignRows = campaignsFrom(rows(campaigns), now);
  const delivering =
    adDays.some((day) => day.date === today && day.spend > 0) ||
    campaignRows.some((row) => row.effectiveStatus === "ACTIVE");
  return {
    adDays,
    campaigns: campaignRows,
    delivering,
    metaAds: metaAdsFrom(ours, now),
    state,
  };
};
