import { expect, it } from "vitest";

import type { AdDemand, MarketDemand } from "./demand";
import {
  demandPoints,
  judgeIdea,
  rankIdeas,
  SATURATED_ADVERTISERS,
  SATURATED_LISTINGS,
  sweetSpotOf,
  wilsonLower,
} from "./sweet-spot";
import type { SweetSpotInput } from "./sweet-spot";

const ads = (
  advertisers: number,
  validated: number,
  evergreen = 0
): AdDemand => ({
  advertisers,
  evergreen,
  longestDays: evergreen > 0 ? 40 : 15,
  samples: [],
  validated,
});

const market = (bestsellers: number, reviews = 0): MarketDemand => ({
  bestsellers,
  listings: [],
  reviews,
});

const idea = (overrides: Partial<SweetSpotInput> = {}): SweetSpotInput => ({
  gaps: 0,
  listings: 2,
  market: market(2, 400),
  qlooAffinity: 0.8,
  ...overrides,
});

it("bounds the share from below, tighter with more evidence", () => {
  expect(wilsonLower(0, 0)).toBe(0);
  expect(wilsonLower(5, 10)).toBeLessThan(0.5);
  expect(wilsonLower(50, 100)).toBeGreaterThan(wilsonLower(5, 10));
  expect(wilsonLower(10, 10)).toBeLessThan(1);
});

it("drops an idea with no proof of demand", () => {
  const verdict = judgeIdea(idea({ market: market(0, 10) }));
  expect(verdict).toMatchObject({ kept: false, reason: "no_demand_proof" });
});

it("drops a saturated idea: too many near-identical listings", () => {
  const verdict = judgeIdea(
    idea({ listings: SATURATED_LISTINGS, market: market(6, 5000) })
  );
  expect(verdict).toMatchObject({ kept: false, reason: "saturated" });
});

it("drops a saturated idea: so many advertisers that ads cost too much", () => {
  const verdict = judgeIdea(
    idea({ ads: ads(SATURATED_ADVERTISERS, 5, 2), listings: 0 })
  );
  expect(verdict).toMatchObject({ kept: false, reason: "saturated" });
});

it("drops an idea whose sellers far outnumber the demand seen", () => {
  const verdict = judgeIdea(
    idea({ ads: ads(10, 1), listings: 6, market: market(0) })
  );
  expect(verdict).toMatchObject({ kept: false, reason: "saturated" });
});

it("gates on Qloo evidence and a competition read", () => {
  expect(judgeIdea(idea({ qlooAffinity: 0 }))).toMatchObject({
    reason: "no_qloo_evidence",
  });
  expect(judgeIdea(idea({ listings: undefined }))).toMatchObject({
    reason: "no_competition_read",
  });
  expect(judgeIdea(idea())).toMatchObject({ kept: true });
});

it("counts advertisers as supply, only long-running ads as demand", () => {
  // Five more shops advertising for a few days: no more demand, more
  // supply, so a lower score (the old rank counted them as demand).
  const few = idea({ ads: ads(2, 2) });
  const crowded = idea({ ads: ads(7, 2) });
  expect(demandPoints(crowded.ads, crowded.market)).toBe(
    demandPoints(few.ads, few.market)
  );
  expect(sweetSpotOf(crowded).supply).toBe(sweetSpotOf(few).supply + 5);
  expect(sweetSpotOf(crowded).score).toBeLessThan(sweetSpotOf(few).score);
});

it("ranks thin evidence below a proven idea, even with gaps", () => {
  const thin = idea({ gaps: 3, listings: 0, market: market(1) });
  const proven = idea({
    ads: ads(4, 4, 3),
    listings: 3,
    market: market(3, 900),
  });
  const { kept } = rankIdeas([thin, proven], (one) => one);
  expect(kept.map((one) => one.item)).toStrictEqual([proven, thin]);
});

it("ranks an open market above a crowded one with the same demand", () => {
  const open = idea({ listings: 1 });
  const busier = idea({ listings: 6 });
  const { kept } = rankIdeas([busier, open], (one) => one);
  expect(kept[0]?.item).toBe(open);
});

it("gives a bonus for audience gaps no listing covers", () => {
  expect(sweetSpotOf(idea({ gaps: 2 })).score).toBeGreaterThan(
    sweetSpotOf(idea()).score
  );
});

it("keeps fewer rather than padding, and says why each was dropped", () => {
  const { dropped, kept } = rankIdeas(
    [
      idea(),
      idea({ market: market(0) }),
      idea({ listings: SATURATED_LISTINGS + 4 }),
    ],
    (one) => one
  );
  expect(kept).toHaveLength(1);
  expect(dropped.map((one) => one.reason)).toStrictEqual([
    "no_demand_proof",
    "saturated",
  ]);
});
