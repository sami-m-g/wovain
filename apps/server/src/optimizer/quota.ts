import { quotaSchema, stateSchema } from "@wovain/shared/optimizer/records";
import type { Firestore } from "firebase-admin/firestore";

import { optimizerDocs } from "./docs.ts";

// Per-merchant daily limits (spec section 7), a Firestore counter on the
// merchant's state document until #19 picks a shared quota. Past a limit the
// caller degrades: a run waits for the next window, a review is code only, a
// read is skipped. Counters reset at midnight UTC.

const DAILY_LIMITS = {
  model: 12,
  qloo: 4,
  reviews: 3,
  runs: 400,
  tavily: 4,
  upstream: 800,
} as const;
export type QuotaKind = keyof typeof DAILY_LIMITS;

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

export const createQuota = (
  db: Firestore,
  uid: string,
  now: () => number = Date.now
) => {
  const ref = optimizerDocs(db).state(uid);

  // Takes `count` from today's budget; false (and nothing taken) when it
  // would go past the limit.
  const take = async (kind: QuotaKind, count = 1) =>
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const day = dayOf(now());
      const current = stateSchema.parse(doc.data() ?? {}).quota;
      const quota = current.day === day ? current : quotaSchema.parse({ day });
      if (quota[kind] + count > DAILY_LIMITS[kind]) {
        return false;
      }
      tx.set(
        ref,
        { quota: { ...quota, [kind]: quota[kind] + count } },
        { merge: true }
      );
      return true;
    });

  // What's left of today's budget.
  const left = async (kind: QuotaKind) => {
    const doc = await ref.get();
    const { quota } = stateSchema.parse(doc.data() ?? {});
    return DAILY_LIMITS[kind] - (quota.day === dayOf(now()) ? quota[kind] : 0);
  };

  return { left, take };
};
