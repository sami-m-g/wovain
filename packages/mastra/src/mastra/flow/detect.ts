import { resolveAccount } from "@wovain/core/ads";
import { EVENTS } from "@wovain/core/events";
import {
  metaPageReady,
  metaPaymentReady,
  pixelReady,
  shopReady,
} from "@wovain/core/setup";

import type { Actor } from "./actor";
import { listConnections, withProvider } from "./connections";
import type { getInsights } from "./insights";
import { reachMilestone } from "./milestones";
import type { MilestoneName } from "./milestones";

// Meta statuses that mean the merchant put the campaign live (wovain stages
// it PAUSED), whether or not Meta's review has finished.
const NOT_LIVE = new Set(["ARCHIVED", "DELETED", "PAUSED"]);

type Reading = Pick<Awaited<ReturnType<typeof getInsights>>, "ads" | "shop">;

/**
 * Records the milestones the merchant's accounts show: a campaign put live
 * (campaign_started), Meta delivering it (campaign_delivering, the first
 * impression), a first sale, and a first profitable product (Fourthwall
 * profit minus Meta spend above zero). Called with the numbers Insights has
 * just read, so it adds no upstream calls.
 */
export const detectMilestones = async (actor: Actor, reading: Reading) => {
  const reached = async (
    name: MilestoneName,
    done: boolean,
    properties?: Record<string, unknown>
  ) => done && (await reachMilestone(actor, name, properties));
  const campaigns = reading.ads.status === "ok" ? reading.ads.campaigns : [];
  await reached(
    "campaign_started",
    campaigns.some(
      (item) =>
        item.status !== undefined && !NOT_LIVE.has(item.status.toUpperCase())
    )
  );
  await reached(
    "campaign_delivering",
    campaigns.some((item) => item.impressions > 0)
  );
  if (reading.shop.status !== "ok") {
    return;
  }
  const { orders, profit, revenue } = reading.shop.totals;
  const firstSale = await reached("first_sale", orders > 0, {
    order_value: revenue,
    profit,
  });
  if (firstSale) {
    // The milestone is recorded once, so this alert goes once (openspec
    // alerts).
    await actor.events?.send({
      data: {
        actions: [],
        body: "Your shop has its first order. Insights has the numbers.",
        dedupeKey: "first_sale",
        kind: "first_sale",
        title: "Your first sale",
        url: "/dashboard/insights",
        userId: actor.userId,
      },
      id: `notify:first_sale:${actor.userId}`,
      name: EVENTS.notify,
    });
  }
  const spend = reading.ads.status === "ok" ? reading.ads.totals.spend : 0;
  await reached("first_profitable_product", profit - spend > 0, {
    ad_spend: spend,
    net_profit: profit - spend,
  });
};

/** The setup steps the merchant's Fourthwall and Meta accounts show done. */
export const detectSetup = async (actor: Actor) => {
  const connections = await listConnections(actor);
  const connected = new Set(connections.map((item) => item.provider));
  if (connected.has("fourthwall")) {
    await withProvider(actor, "fourthwall", async (call) => {
      if (await shopReady(call)) {
        await reachMilestone(actor, "fourthwall_shop_ready");
      }
    });
  }
  if (connected.has("meta")) {
    await withProvider(actor, "meta", async (call) => {
      if (await metaPaymentReady(call)) {
        await reachMilestone(actor, "meta_payment_ready");
      }
      const accountId = await resolveAccount(call);
      if (await metaPageReady(call, accountId)) {
        await reachMilestone(actor, "meta_page_ready");
      }
      if (await pixelReady(call, accountId)) {
        await reachMilestone(actor, "pixel_ready");
      }
    });
  }
};
