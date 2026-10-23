import type { SnapshotRows } from "@wovain/shared/optimizer/snapshot";
import type { Firestore } from "firebase-admin/firestore";

import { optimizerDocs } from "./docs.ts";
import { createQuota } from "./quota.ts";
import type { Reader } from "./read.ts";
import {
  pollFourthwall,
  REPORT_TTL_MS,
  reportRowsSchema,
} from "./sources/fourthwall.ts";
import type { FourthwallPoll } from "./sources/fourthwall.ts";
import { pollMeta } from "./sources/meta.ts";
import type { MetaPoll } from "./sources/meta.ts";
import type { TrendSource } from "./sources/trends.ts";
import type { Wovain } from "./sources/wovain.ts";
import type { OptimizationStore } from "./store.ts";

// The poll half of a run (spec section 2, Polling): the merchant's
// Fourthwall and Meta on their own grants within the day's upstream budget,
// the daily niche trends within the Qloo budget, and what each source gave,
// saved on the state. Polling stays on for 24 hours after Meta last showed
// delivery, and then stops until a status webhook, a launch or a resume.

const ACTIVE_MS = 24 * 3_600_000;
// Upstream calls one poll may make: offers, up to 5 order pages,
// fulfillment, 3 reports and 2 Meta reads, with room to spare.
const POLL_CALLS = 16;

export interface Polled {
  fourthwall?: FourthwallPoll | undefined;
  meta?: MetaPoll | undefined;
}

export const createCollector = ({
  db,
  now,
  trends,
  readerFor,
}: {
  db: Firestore;
  now: () => number;
  trends?: TrendSource | undefined;
  readerFor: Reader;
}) => {
  const docs = optimizerDocs(db);

  // The merchant's Fourthwall and Meta, read on their own grants. A poll
  // spends its upstream budget up front, so parallel reads don't race on
  // the counter.
  const poll = async (
    uid: string,
    store: OptimizationStore,
    wovain: Wovain
  ) => {
    const quota = createQuota(db, uid, now);
    const [granted, state] = await Promise.all([
      quota.take("upstream", POLL_CALLS),
      store.state(),
    ]);
    let budget = granted ? POLL_CALLS : 0;
    const call = readerFor(uid, async () => {
      budget -= 1;
      return await Promise.resolve(budget >= 0);
    });
    const at = now();
    const [fourthwall, meta] = await Promise.all([
      pollFourthwall({
        cached: async (key, load) =>
          await store.cached(
            key,
            { at, schema: reportRowsSchema, ttlMs: REPORT_TTL_MS },
            load
          ),
        call,
        designOf: wovain.designOf,
        now: at,
        productIds: wovain.productIds,
        since: state.cursors["fourthwall"],
      }),
      pollMeta({
        accountId: wovain.campaign?.adAccountId,
        call,
        campaignId: wovain.campaign?.campaignId,
        now: at,
      }),
    ]);
    return { fourthwall, meta };
  };

  const trendRows = async (uid: string, wovain: Wovain, daily: boolean) => {
    if (trends === undefined || !daily) {
      return new Map<string, SnapshotRows>();
    }
    const quota = createQuota(db, uid, now);
    // tasteOf makes up to 3 Qloo calls per niche.
    const fetch = (await quota.take("qloo", 3)) ? 1 : 0;
    const rows = await trends.read({
      at: now(),
      fetch,
      niches: wovain.designs.map((design) => design.idea),
    });
    return new Map([
      [new Date(now()).toISOString().slice(0, 10), { trends: rows }],
    ]);
  };

  const record = async (
    uid: string,
    store: OptimizationStore,
    { fourthwall, meta, metaActive }: Polled & { metaActive: boolean }
  ) => {
    const at = now();
    const state = await store.state();
    const active = metaActive || meta?.delivering === true;
    const activeUntil = active ? at + ACTIVE_MS : state.activeUntil;
    await store.patchState({
      ...(activeUntil === undefined ? {} : { activeUntil }),
      cursors: {
        ...state.cursors,
        ...(fourthwall?.cursor === undefined
          ? {}
          : { fourthwall: fourthwall.cursor }),
      },
      observed: {
        ...state.observed,
        ...(fourthwall === undefined
          ? {}
          : {
              fourthwall: {
                at,
                rows: fourthwall.orders.length + fourthwall.stock.length,
                state: fourthwall.state,
              },
            }),
        ...(meta === undefined
          ? {}
          : { meta: { at, rows: meta.adDays.length, state: meta.state } }),
      },
    });
    if (active) {
      await docs.due(uid).set({ activeUntil: at + ACTIVE_MS }, { merge: true });
    }
  };

  return { poll, record, trendRows };
};
