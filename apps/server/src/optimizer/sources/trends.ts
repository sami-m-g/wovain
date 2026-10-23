import { trendCacheSchema } from "@wovain/shared/optimizer/records";
import type { TrendRow } from "@wovain/shared/optimizer/snapshot";
import type { Firestore } from "firebase-admin/firestore";

import { tasteOf } from "../../lib/qloo.ts";
import type { QlooGet } from "../../lib/qloo.ts";
import { logErrorClass } from "../../lib/tool-result.ts";
import { optimizerDocs } from "../docs.ts";

// The niches a merchant sells in, checked once a day and cached per niche in
// trendCache, so merchants in the same niche share one call. Qloo's
// population-rank velocity for the niche's first entity is the signal; what
// its scale means isn't documented, so it's kept as a direction with the raw
// change (unverified) and is evidence only, never a trigger (POD-S4, R5).
// Tavily's news has no number to compare, so it isn't read here.

// The daily sweep checks at most this many niches per merchant.
const MAX_NICHES = 2;
const FLAT = 0.05;

// A niche key from a design's idea: lowercase words, hyphens, bounded.
const nicheKeyOf = (idea: string) =>
  idea
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
    .slice(0, 60);

// The search phrase a key stands for.
const queryOf = (key: string) => key.replaceAll("-", " ");

const directionOf = (change: number): TrendRow["direction"] => {
  if (Math.abs(change) < FLAT) {
    return "flat";
  }
  return change > 0 ? "up" : "down";
};

export const createTrendSource = (db: Firestore, qloo?: QlooGet) => {
  const docs = optimizerDocs(db);

  // The shared cache holds only what the niche key gives: the key itself
  // and Qloo's answer for it, never one merchant's own wording.
  const cachedRow = async (key: string, date: string) => {
    const doc = await docs.trend(key, date).get();
    const parsed = trendCacheSchema.safeParse(doc.data());
    return parsed.success ? parsed.data.rows[0] : undefined;
  };

  const fetchRow = async (
    key: string,
    date: string,
    at: number
  ): Promise<TrendRow | undefined> => {
    if (qloo === undefined) {
      return undefined;
    }
    // Qloo is asked with the key, so the cached value depends on it alone.
    const { velocity } = await tasteOf(qloo, queryOf(key));
    if (velocity === undefined) {
      return undefined;
    }
    const row = {
      changePct: velocity * 100,
      direction: directionOf(velocity),
      evidence: [],
      niche: key,
    };
    await docs.trend(key, date).set({ fetchedAt: at, rows: [row] });
    return row;
  };

  // A failed Qloo call leaves the niche out of today's trends.
  const safeFetch = async (
    key: string,
    date: string,
    at: number
  ): Promise<TrendRow | undefined> => {
    let row: TrendRow | undefined;
    try {
      row = await fetchRow(key, date, at);
    } catch (error) {
      logErrorClass("optimizer trend skipped:", error);
    }
    return row;
  };

  // Today's row per niche: the cache first, then (on the daily sweep, within
  // the merchant's Qloo budget) one fresh call per uncached niche. Each row
  // comes back named with the reading merchant's own niche.
  const read = async ({
    at,
    fetch,
    niches,
  }: {
    at: number;
    // How many fresh calls this read may make (quota.ts).
    fetch: number;
    niches: string[];
  }): Promise<TrendRow[]> => {
    const date = new Date(at).toISOString().slice(0, 10);
    const byKey = new Map<string, string>();
    for (const niche of niches) {
      const key = nicheKeyOf(niche);
      if (key !== "" && !byKey.has(key)) {
        byKey.set(key, niche.trim());
      }
    }
    const keys = [...byKey.keys()].slice(0, MAX_NICHES);
    const hits = await Promise.all(
      keys.map(async (key) => await cachedRow(key, date))
    );
    const missing = keys
      .filter((_, index) => hits[index] === undefined)
      .slice(0, fetch);
    const fresh = await Promise.all(
      missing.map(async (key) => await safeFetch(key, date, at))
    );
    return [...hits, ...fresh].flatMap((row) =>
      row === undefined
        ? []
        : [{ ...row, niche: byKey.get(row.niche) ?? row.niche }]
    );
  };

  return { read };
};

export type TrendSource = ReturnType<typeof createTrendSource>;
