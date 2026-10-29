import { user } from "@wovain/db/schema/auth";
import { milestone } from "@wovain/db/schema/seller";
import { eq } from "drizzle-orm";

import type { Actor } from "./actor";

// The north star: a first live campaign within 10 minutes of sign-up, and a
// first profit within 60 minutes of that campaign delivering. Each step is
// recorded once per merchant and sent to PostHog with its timestamp and the
// seconds since sign-up.

export const MILESTONES = [
  "signed_up",
  "connection_completed",
  "fourthwall_shop_ready",
  "payouts_ready",
  "meta_payment_ready",
  "meta_page_ready",
  "pixel_ready",
  "first_drop_started",
  "design_approved",
  "products_published",
  "campaign_started",
  "campaign_delivering",
  "first_sale",
  "first_profitable_product",
] as const;
export type MilestoneName = (typeof MILESTONES)[number];

const SECOND_MS = 1000;
const MINUTE_S = 60;

/** Targets in minutes, shown on Insights and charted in PostHog. */
export const TARGETS = {
  // campaign_delivering to first_profitable_product
  timeToFirstProfit: 60,
  // signed_up to campaign_started
  timeToLiveCampaign: 10,
} as const;

type Journey = Partial<Record<MilestoneName, Date>>;

const minutesBetween = (from: Date | undefined, to: Date | undefined) =>
  from === undefined || to === undefined
    ? undefined
    : Math.max(0, (to.getTime() - from.getTime()) / SECOND_MS / MINUTE_S);

/** The merchant's milestones with the two KPIs and Meta's review wait. */
export const journeyOf = (journey: Journey) => ({
  metaReviewMinutes: minutesBetween(
    journey.campaign_started,
    journey.campaign_delivering
  ),
  timeToFirstProfitMinutes: minutesBetween(
    journey.campaign_delivering,
    journey.first_profitable_product
  ),
  timeToLiveCampaignMinutes: minutesBetween(
    journey.signed_up,
    journey.campaign_started
  ),
});

export const getJourney = async ({ db, userId }: Actor) => {
  const [rows, account] = await Promise.all([
    db.select().from(milestone).where(eq(milestone.userId, userId)),
    db.select({ at: user.createdAt }).from(user).where(eq(user.id, userId)),
  ]);
  const journey: Journey = {};
  if (account[0] !== undefined) {
    journey.signed_up = account[0].at;
  }
  for (const row of rows) {
    journey[row.name as MilestoneName] = row.at;
  }
  return journey;
};

/**
 * Records a first, once: the first caller inserts the row and sends the
 * PostHog event; later callers find it and do nothing. `signed_up` is sent by
 * Better Auth's hook (packages/auth) and not through here.
 */
export const reachMilestone = async (
  actor: Pick<Actor, "analytics" | "db" | "userId">,
  name: MilestoneName,
  properties: Record<string, unknown> = {}
): Promise<boolean> => {
  const at = new Date();
  const inserted = await actor.db
    .insert(milestone)
    .values({ at, name, userId: actor.userId })
    .onConflictDoNothing({ target: [milestone.userId, milestone.name] })
    .returning({ name: milestone.name });
  if (inserted.length === 0) {
    return false;
  }
  const [account] = await actor.db
    .select({ at: user.createdAt })
    .from(user)
    .where(eq(user.id, actor.userId));
  await actor.analytics?.capture({
    distinctId: actor.userId,
    event: name,
    properties: {
      ...properties,
      reached_at: at.toISOString(),
      seconds_since_signup:
        account === undefined
          ? undefined
          : Math.round((at.getTime() - account.at.getTime()) / SECOND_MS),
    },
    timestamp: at,
  });
  return true;
};
