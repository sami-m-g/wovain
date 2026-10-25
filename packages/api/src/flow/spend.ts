import {
  isAllowlisted,
  refusal,
  refusalError,
  STEP_COST_USD,
  startOfUtcDay,
} from "@wovain/core/spend";
import type { SpendKind } from "@wovain/core/spend";
import { user } from "@wovain/db/schema/auth";
import { usage } from "@wovain/db/schema/seller";
import { and, count, eq, gte, isNull, sum } from "drizzle-orm";
import { log } from "evlog";

import type { Actor } from "./actor";

// Checks a paid step against the merchant's quota and today's spend cap
// before it runs, then records its estimated cost. Allowlisted merchants
// pass unmetered. `record: false` only checks (a run before it's saved).
export const meter = async (
  actor: Actor,
  kind: SpendKind,
  {
    record = true,
    runId,
  }: { record?: boolean; runId?: string | null | undefined } = {}
) => {
  const { core, db, userId } = actor;
  const [merchant] = await db
    .select({
      email: user.email,
      emailVerified: user.emailVerified,
      locale: user.locale,
    })
    .from(user)
    .where(eq(user.id, userId));
  if (merchant === undefined || isAllowlisted(core.spend, merchant.email)) {
    return;
  }
  const today = startOfUtcDay();
  const mine = (step: SpendKind) =>
    and(
      eq(usage.userId, userId),
      eq(usage.kind, step),
      gte(usage.createdAt, today)
    );
  const [[spent], [runs], [images]] = await Promise.all([
    db
      .select({ usd: sum(usage.costUsd).mapWith(Number) })
      .from(usage)
      .where(gte(usage.createdAt, today)),
    db.select({ n: count() }).from(usage).where(mine("run")),
    db
      .select({ n: count() })
      .from(usage)
      .where(
        runId === undefined || runId === null
          ? and(mine("image"), isNull(usage.runId))
          : and(eq(usage.kind, "image"), eq(usage.runId, runId))
      ),
  ]);
  const used = {
    emailVerified: merchant.emailVerified,
    images: images?.n ?? 0,
    runsToday: runs?.n ?? 0,
    spentTodayUsd: spent?.usd ?? 0,
  };
  const refused = refusal(core.spend, kind, used);
  if (refused === "spend_cap") {
    // The alerting (self-healing, PostHog) watches for this event.
    log.error({
      error: "SPEND_CAP",
      spend: { capUsd: core.spend.dailyCapUsd, spentUsd: used.spentTodayUsd },
    });
  }
  if (refused !== undefined) {
    actor.log?.set({ spend: { kind, refused, ...used } });
    throw refusalError(refused, core.spend, merchant.locale);
  }
  if (record) {
    await db.insert(usage).values({
      costUsd: STEP_COST_USD[kind],
      kind,
      runId: runId ?? null,
      userId,
    });
  }
};
