import { describe, expect, it } from "vitest";

import {
  decideCampaign,
  killOf,
  targetsOf,
  adRuleSettingsOf,
} from "./ad-rules";
import {
  anglesOf,
  angleWhys,
  baseRateOf,
  DEFAULT_RATE,
  fitOutcomeModel,
  floorShares,
  MAX_MULTIPLIER,
  outcomeScore,
  priceBandOf,
  profitOf,
  realCostPerSaleOf,
} from "./outcomes";
import type { DesignOutcome } from "./outcomes";

const NOW = new Date("2026-10-29T12:00:00Z");
const DAY_MS = 86_400_000;
const LAUNCHED = new Date(NOW.getTime() - 10 * DAY_MS);

// A $30 tee leaving $10 a sale, sold through Fourthwall from launch day.
const outcome = (over: Partial<DesignOutcome> = {}): DesignOutcome => ({
  addToCarts: 0,
  audience: "Book lovers",
  blank: "prd_tee",
  clicks: 0,
  dropId: null,
  impressions: 0,
  launchedAt: LAUNCHED,
  palette: "Moss",
  priceCents: 3000,
  productId: `p_${Math.random()}`,
  profitPerSaleCents: 1000,
  purchases: 0,
  qlooEntities: [],
  qlooTags: [],
  revenueCents: 0,
  salesCovered: true,
  spendCents: 0,
  theme: "Gothic",
  units: 0,
  ...over,
});

// `wins` cottagecore designs that each sold 3, `losses` that sold nothing.
const record = (theme: string, wins: number, losses: number, drop = theme) => [
  ...Array.from({ length: wins }, (_, index) =>
    outcome({
      dropId: `${drop}_${index}`,
      productId: `${theme}_w${index}`,
      qlooTags: [theme],
      theme,
      units: 3,
    })
  ),
  ...Array.from({ length: losses }, (_, index) =>
    outcome({
      dropId: `${drop}_l${index}`,
      productId: `${theme}_l${index}`,
      qlooTags: [theme],
      spendCents: 500,
      theme,
    })
  ),
];

describe("angles", () => {
  it("lists theme, tags, entities, audience, palette, price band and blank once each", () => {
    expect(
      anglesOf({
        audience: "Book lovers",
        blank: "prd_tee",
        palette: "Moss",
        priceCents: 2800,
        qlooEntities: ["Studio Ghibli", " "],
        qlooTags: ["Cottagecore", "cottagecore"],
        theme: "Cottagecore",
      })
    ).toEqual([
      { kind: "theme", value: "Cottagecore" },
      { kind: "tag", value: "cottagecore" },
      { kind: "entity", value: "Studio Ghibli" },
      { kind: "audience", value: "Book lovers" },
      { kind: "palette", value: "Moss" },
      { kind: "price", value: "25-35" },
      { kind: "blank", value: "prd_tee" },
    ]);
  });

  it("bands prices", () => {
    expect(priceBandOf(1999)).toBe("under-25");
    expect(priceBandOf(3500)).toBe("35-50");
    expect(priceBandOf(9000)).toBe("50-up");
  });

  it("counts Fourthwall units when covered from launch, Meta purchases otherwise", () => {
    expect(profitOf(outcome({ spendCents: 400, units: 2 }))).toBe(1600);
    expect(
      profitOf(outcome({ purchases: 1, salesCovered: false, units: 5 }))
    ).toBe(1000);
  });
});

describe("the outcome model", () => {
  it("shrinks the merchant's rate to the global one", () => {
    expect(baseRateOf(0, 0)).toBe(DEFAULT_RATE);
    // 30 designs across merchants, 15 won: the prior is 0.5.
    expect(baseRateOf(0, 0, { designs: 30, wins: 15 })).toBe(0.5);
    // 10 of the merchant's own, all wins, against the 0.2 default.
    expect(baseRateOf(10, 10)).toBeCloseTo(0.6, 5);
  });

  it("leaves designs younger than 3 days out unless they already won", () => {
    const young = new Date(NOW.getTime() - DAY_MS);
    const model = fitOutcomeModel(
      [
        outcome({ launchedAt: young }),
        outcome({ launchedAt: young, units: 1 }),
      ],
      { now: NOW }
    );
    expect(model.designs).toBe(1);
    expect(model.wins).toBe(1);
  });

  it("moves an angle seen once only a little, and one seen often a lot", () => {
    const once = fitOutcomeModel(record("cottagecore", 1, 0), { now: NOW });
    const often = fitOutcomeModel(
      [...record("cottagecore", 6, 0), ...record("gothic", 0, 6)],
      { now: NOW }
    );
    const liftOf = (model: typeof once, value: string) =>
      model.angles.find(
        (angle) => angle.kind === "tag" && angle.value === value
      )?.lift ?? 0;
    expect(liftOf(once, "cottagecore")).toBeGreaterThan(1);
    expect(liftOf(once, "cottagecore")).toBeLessThan(1.35);
    expect(liftOf(often, "cottagecore")).toBeGreaterThan(1.5);
    expect(liftOf(often, "gothic")).toBeLessThan(0.6);
  });

  it("is neutral without a record or a shared angle", () => {
    expect(outcomeScore({ theme: "Cottagecore" }).multiplier).toBe(1);
    const model = fitOutcomeModel(record("cottagecore", 3, 0), { now: NOW });
    expect(
      outcomeScore({ qlooTags: ["western"], theme: "Western" }, model)
    ).toEqual({ evidence: [], multiplier: 1 });
  });

  it("favours winning angles and explains why, within the clamp", () => {
    const model = fitOutcomeModel(
      [...record("cottagecore", 6, 0), ...record("gothic", 0, 6)],
      { now: NOW }
    );
    const win = outcomeScore(
      { qlooTags: ["Cottagecore"], theme: "cottagecore" },
      model
    );
    const lose = outcomeScore({ qlooTags: ["gothic"], theme: "Gothic" }, model);
    expect(win.multiplier).toBeGreaterThan(1);
    expect(win.multiplier).toBeLessThanOrEqual(MAX_MULTIPLIER);
    expect(lose.multiplier).toBeLessThan(1);
    expect(lose.multiplier).toBeGreaterThanOrEqual(1 / MAX_MULTIPLIER);
    expect(win.why).toMatchObject({
      direction: "up",
      drops: 6,
      profitCents: 6 * 3000,
    });
    expect(lose.why).toMatchObject({
      direction: "down",
      profitCents: -6 * 500,
    });
  });

  it("gives no reason while the evidence is thin", () => {
    const model = fitOutcomeModel(record("cottagecore", 1, 0), { now: NOW });
    expect(outcomeScore({ theme: "cottagecore" }, model).why).toBeUndefined();
    expect(angleWhys(model)).toEqual([]);
  });

  it("averages within a kind so many entities never outvote one audience", () => {
    const model = fitOutcomeModel(
      [
        ...Array.from({ length: 6 }, (_, index) =>
          outcome({
            audience: "Night owls",
            productId: `n${index}`,
            qlooEntities: ["A", "B", "C", "D"],
            units: 2,
          })
        ),
        ...Array.from({ length: 6 }, (_, index) =>
          outcome({ audience: "Gym goers", productId: `g${index}` })
        ),
      ],
      { now: NOW }
    );
    const score = outcomeScore(
      { audience: "Gym goers", qlooEntities: ["A", "B", "C", "D"] },
      model
    );
    const entityOnly = outcomeScore({ qlooEntities: ["A"] }, model);
    expect(score.multiplier).toBeLessThan(entityOnly.multiplier);
  });

  it("lists winners first for What we learned", () => {
    const model = fitOutcomeModel(
      [...record("cottagecore", 6, 0), ...record("gothic", 0, 6)],
      { now: NOW }
    );
    const whys = angleWhys(model);
    expect(whys[0]?.direction).toBe("up");
    expect(whys.at(-1)?.direction).toBe("down");
  });
});

describe("a test's spend floor", () => {
  it("splits evenly with no record", () => {
    expect(floorShares([1, 1, 1])).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it("gives a winning angle more while every design keeps half an even share", () => {
    const shares = floorShares([2, 1, 0.5]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 10);
    expect(shares[0]).toBeGreaterThan(shares[1] ?? 1);
    for (const share of shares) {
      expect(share).toBeGreaterThanOrEqual(0.5 / 3);
    }
  });
});

describe("the real cost per sale", () => {
  const settings = adRuleSettingsOf({});

  it("waits for enough purchases", () => {
    expect(
      realCostPerSaleOf({ purchases: 9, spendCents: 5000 }, 1000)
    ).toBeUndefined();
  });

  it("shrinks the observed cost toward the profit per sale", () => {
    // $60 for 12 sales is $5 a sale; 3 prior sales at $10 make it $6.
    expect(realCostPerSaleOf({ purchases: 12, spendCents: 6000 }, 1000)).toBe(
      600
    );
  });

  it("cuts an ad sooner once a sale really costs less than it earns", () => {
    const economics = {
      priceCents: 3000,
      profitCents: 1000,
      realCostPerSaleCents: 600,
    };
    const targets = targetsOf(economics, settings);
    expect(targets).toMatchObject({ real: true, targetCpaCents: 600 });
    const ad = {
      active: true,
      adId: "ad1",
      addToCarts: 0,
      clicks: 40,
      impressions: 3000,
      purchases: 0,
      spendCents: 700,
    };
    const kill =
      targets === undefined ? undefined : killOf(ad, targets, settings);
    expect(kill?.rule).toBe("no_sale_spend");
    expect(kill?.reason).toContain("real cost per sale");
    // Without the record the same ad keeps running.
    expect(
      decideCampaign(
        {
          ads: [ad],
          campaignId: "c1",
          dailyBudgetCents: 1000,
          economics: { priceCents: 3000, profitCents: 1000 },
          learning: true,
          live: true,
        },
        settings,
        { now: NOW, roomCents: 0 }
      ).kind
    ).toBe("hold");
  });

  it("never raises the target above the profit per sale", () => {
    expect(
      targetsOf(
        { priceCents: 3000, profitCents: 1000, realCostPerSaleCents: 2500 },
        settings
      )
    ).toMatchObject({ real: false, targetCpaCents: 1000 });
  });
});
