import type { Database } from "@wovain/db";
import {
  creditGrant,
  creditLedger,
  creditReservation,
} from "@wovain/db/schema/billing";
import type { CreditTake } from "@wovain/db/schema/billing";
import { and, asc, eq, gt, isNull, sql, sum } from "drizzle-orm";

import { CREDIT_COST } from "./plans";
import type { CreditStep } from "./plans";

// Spending credits: reserve before a paid step, then settle it when the step
// succeeds or release it when the step fails. A reservation locks the
// merchant's grant rows (SELECT ... FOR UPDATE) for its transaction, so two
// concurrent steps can't both spend the same credits: the second waits, then
// reads what the first left. Plan credits go first (they expire), packs last.

export interface Balance {
  available: number;
  pack: number;
  plan: number;
}

export const creditBalance = async (
  db: Database,
  userId: string
): Promise<Balance> => {
  const rows = await db
    .select({
      source: creditGrant.source,
      total: sum(creditGrant.remaining).mapWith(Number),
    })
    .from(creditGrant)
    .where(and(eq(creditGrant.userId, userId), isNull(creditGrant.revokedAt)))
    .groupBy(creditGrant.source);
  const of = (source: "plan" | "pack") =>
    rows.find((row) => row.source === source)?.total ?? 0;
  const plan = of("plan");
  const pack = of("pack");
  return { available: plan + pack, pack, plan };
};

export type Reservation =
  | { available: number; id: string; ok: true }
  | { available: number; needed: number; ok: false };

// Takes `needed` credits from the grants in order, as far as they go.
const takeFrom = (
  grants: { id: string; periodKey: string; remaining: number }[],
  needed: number
): CreditTake[] => {
  const takes: CreditTake[] = [];
  let left = needed;
  for (const grant of grants) {
    if (left === 0) {
      break;
    }
    const credits = Math.min(grant.remaining, left);
    takes.push({ credits, grantId: grant.id, periodKey: grant.periodKey });
    left -= credits;
  }
  return takes;
};

export const reserveCredits = async (
  db: Database,
  {
    runId,
    step,
    userId,
  }: { runId?: string | null | undefined; step: CreditStep; userId: string }
): Promise<Reservation> => {
  const needed = CREDIT_COST[step];
  return await db.transaction(async (tx) => {
    const grants = await tx
      .select({
        id: creditGrant.id,
        periodKey: creditGrant.periodKey,
        remaining: creditGrant.remaining,
      })
      .from(creditGrant)
      .where(
        and(
          eq(creditGrant.userId, userId),
          gt(creditGrant.remaining, 0),
          isNull(creditGrant.revokedAt)
        )
      )
      .orderBy(
        asc(sql`${creditGrant.source} = 'pack'`),
        asc(creditGrant.createdAt),
        asc(creditGrant.id)
      )
      .for("update");
    const available = grants.reduce(
      (total, grant) => total + grant.remaining,
      0
    );
    if (available < needed) {
      return { available, needed, ok: false };
    }
    const takes = takeFrom(grants, needed);
    // One connection: the transaction's statements still run one by one.
    await Promise.all(
      takes.map(
        async (take) =>
          await tx
            .update(creditGrant)
            .set({ remaining: sql`${creditGrant.remaining} - ${take.credits}` })
            .where(eq(creditGrant.id, take.grantId))
      )
    );
    const [held] = await tx
      .insert(creditReservation)
      .values({ credits: needed, runId: runId ?? null, step, takes, userId })
      .returning({ id: creditReservation.id });
    if (held === undefined) {
      throw new Error("The credit reservation wasn't saved");
    }
    await tx.insert(creditLedger).values({
      delta: -needed,
      idempotencyKey: `reserve:${held.id}`,
      reason: "reserve",
      reservationId: held.id,
      userId,
    });
    return { available: available - needed, id: held.id, ok: true };
  });
};

// Marks a held reservation spent; undefined if it was already settled or
// released. The caller reports the usage to Polar (src/polar.ts).
export const settleCredits = async (db: Database, reservationId: string) => {
  const [settled] = await db
    .update(creditReservation)
    .set({ status: "settled" })
    .where(
      and(
        eq(creditReservation.id, reservationId),
        eq(creditReservation.status, "held")
      )
    )
    .returning({
      credits: creditReservation.credits,
      step: creditReservation.step,
      userId: creditReservation.userId,
    });
  return settled;
};

// Gives a failed step's credits back to the grants they came from, unless a
// grant has since moved to a new period (its credits were reset) or been
// revoked. Returns the credits given back.
export const releaseCredits = async (db: Database, reservationId: string) =>
  await db.transaction(async (tx) => {
    const [released] = await tx
      .update(creditReservation)
      .set({ status: "released" })
      .where(
        and(
          eq(creditReservation.id, reservationId),
          eq(creditReservation.status, "held")
        )
      )
      .returning({
        takes: creditReservation.takes,
        userId: creditReservation.userId,
      });
    if (released === undefined) {
      return 0;
    }
    const given = await Promise.all(
      released.takes.map(async (take) => {
        const rows = await tx
          .update(creditGrant)
          .set({ remaining: sql`${creditGrant.remaining} + ${take.credits}` })
          .where(
            and(
              eq(creditGrant.id, take.grantId),
              eq(creditGrant.periodKey, take.periodKey),
              isNull(creditGrant.revokedAt)
            )
          )
          .returning({ id: creditGrant.id });
        return rows.length > 0 ? take.credits : 0;
      })
    );
    const restored = given.reduce((total, credits) => total + credits, 0);
    if (restored > 0) {
      await tx.insert(creditLedger).values({
        delta: restored,
        idempotencyKey: `release:${reservationId}`,
        reason: "release",
        reservationId,
        userId: released.userId,
      });
    }
    return restored;
  });
