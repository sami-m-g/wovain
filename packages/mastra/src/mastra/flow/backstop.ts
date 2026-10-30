import type { UnitEconomics } from "@wovain/core/ad-rules";
import { EVENTS } from "@wovain/core/events";
import { backstopRulesFor, planBackstop } from "@wovain/core/meta-backstop";
import type { BackstopRule } from "@wovain/core/meta-backstop";
import { campaign } from "@wovain/db/schema/seller";
import { eq } from "drizzle-orm";
import { log as evlog } from "evlog";

import type { Actor } from "./actor";
import { notReady } from "./actor";
import { adRulesOf, economicsOf, isAdRulesOn } from "./ad-rules";
import { autonomyOf } from "./approvals";
import { withProvider } from "./connections";
import { flagContextOf } from "./flags";

// The Meta backstop (openspec meta-backstop): the kill and stop rules of
// each wovain campaign, mirrored into the ad account's Automated Rules
// through Graph on the single Meta grant. Synced on every optimizer tick
// (every 30 minutes) and right after the merchant changes a cap or the
// loss limit; a campaign that ended (archived) loses its rules.

type CampaignRow = typeof campaign.$inferSelect;

export const isBackstopOn = async (actor: Actor) =>
  await actor.core.flags.isOn("meta-backstop-rules", flagContextOf(actor));

// A campaign that can still spend: anything but archived.
const canSpend = (row: CampaignRow) => row.status !== "archived";

const productIdsOf = (row: CampaignRow) =>
  row.designs === null
    ? [row.productId]
    : row.designs.map((design) => design.productId);

// The campaign's tightest economics: the product with the least profit per
// sale, whose limits are the lowest.
const tightest = (
  row: CampaignRow,
  economics: Map<string, UnitEconomics>
): UnitEconomics | undefined =>
  productIdsOf(row)
    .map((id) => economics.get(id))
    .filter((each): each is UnitEconomics => each !== undefined)
    .toSorted((a, b) => a.profitCents - b.profitCents)[0];

export interface BackstopResult {
  created: number;
  kept: number;
  removed: number;
}

/**
 * Brings the merchant's Meta rules in line with wovain's: creates the
 * missing ones, deletes wovain's old ones (changed thresholds, ended
 * campaigns) and never touches the merchant's own rules. A Graph failure
 * throws, so the Inngest step retries it.
 */
export const syncBackstop = async (
  actor: Actor
): Promise<BackstopResult | "flag_off"> => {
  if (!(await isBackstopOn(actor))) {
    return "flag_off";
  }
  const rows = await actor.db
    .select()
    .from(campaign)
    .where(eq(campaign.userId, actor.userId));
  if (rows.length === 0) {
    return { created: 0, kept: 0, removed: 0 };
  }
  const live = rows.filter(canSpend);
  const [settings, autonomy, economics] = await Promise.all([
    adRulesOf(actor),
    autonomyOf(actor),
    economicsOf(actor, [...new Set(live.flatMap(productIdsOf))]),
  ]);
  const wanted = new Map<string, BackstopRule[]>();
  for (const row of rows) {
    const rules = canSpend(row)
      ? backstopRulesFor(
          {
            economics: tightest(row, economics),
            metaCampaignId: row.metaCampaignId,
          },
          settings,
          autonomy
        )
      : [];
    wanted.set(row.adAccountId, [
      ...(wanted.get(row.adAccountId) ?? []),
      ...rules,
    ]);
  }
  return await withProvider(actor, "meta", async (_call, accessToken) => {
    const token = await accessToken();
    const graph = actor.core.metaGraph;
    const result: BackstopResult = { created: 0, kept: 0, removed: 0 };
    for (const [adAccountId, rules] of wanted) {
      // One account at a time: Graph rate-limits rule writes per account.
      // oxlint-disable-next-line no-await-in-loop
      const existing = await graph.rules(token, adAccountId, actor.log);
      const plan = planBackstop(rules, existing);
      for (const rule of plan.remove) {
        // oxlint-disable-next-line no-await-in-loop
        await graph.deleteRule(token, rule.id, actor.log);
      }
      for (const rule of plan.create) {
        // oxlint-disable-next-line no-await-in-loop
        await graph.createRule(
          token,
          adAccountId,
          { ...rule.spec, name: rule.name },
          actor.log
        );
      }
      result.created += plan.create.length;
      result.removed += plan.remove.length;
      result.kept += rules.length - plan.create.length;
    }
    actor.log?.set({ backstop: result });
    return result;
  });
};

/**
 * Asks for a sync now, through an optimizer tick (which syncs after it
 * runs), after the merchant changed a cap or the loss limit. A failed send
 * is logged at error level; the next scheduled tick syncs anyway.
 */
export const requestBackstopSync = async (actor: Actor) => {
  try {
    await actor.events?.send({
      data: { userId: actor.userId },
      name: EVENTS.optimizerTick,
    });
  } catch (error) {
    evlog.error({
      error: "META_BACKSTOP_SYNC_REQUEST_FAILED",
      reason: error instanceof Error ? error.message : String(error),
      userId: actor.userId,
    });
  }
};

const unguarded = (why: string) =>
  notReady({
    fix: "Turn on the ads-profit-rules and meta-backstop-rules flags and reconnect Meta, then approve again.",
    message:
      "wovain won't start this campaign before its spend rules are in place",
    why,
  });

/**
 * Starts nothing until wovain's spend rules watch the campaign and Meta
 * holds its backstop (openspec activate-after-guards): syncs the backstop
 * now, reads the account's rules back and throws unless every rule of this
 * campaign is there.
 */
export const requireSpendGuards = async (actor: Actor, row: CampaignRow) => {
  if (!(await isAdRulesOn(actor))) {
    throw unguarded(
      "The ads-profit-rules flag is off: no kill, stop or loss-limit rule would watch it."
    );
  }
  if ((await syncBackstop(actor)) === "flag_off") {
    throw unguarded(
      "The meta-backstop-rules flag is off: Meta would hold no rule to stop it."
    );
  }
  const [settings, autonomy, economics] = await Promise.all([
    adRulesOf(actor),
    autonomyOf(actor),
    economicsOf(actor, productIdsOf(row)),
  ]);
  const wanted = backstopRulesFor(
    { economics: tightest(row, economics), metaCampaignId: row.metaCampaignId },
    settings,
    autonomy
  );
  const existing = await withProvider(
    actor,
    "meta",
    async (_call, accessToken) =>
      await actor.core.metaGraph.rules(
        await accessToken(),
        row.adAccountId,
        actor.log
      )
  );
  const held = new Set(existing.map((rule) => rule.name));
  if (wanted.length === 0 || wanted.some((rule) => !held.has(rule.name))) {
    throw unguarded("Meta doesn't hold this campaign's automated rules.");
  }
};
