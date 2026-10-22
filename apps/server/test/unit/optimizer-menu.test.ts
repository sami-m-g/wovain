import {
  budgetCap,
  canAutoApply,
  settledFor,
  violations,
} from "@wovain/shared/optimizer/guardrails";
import type { GuardContext } from "@wovain/shared/optimizer/guardrails";
import {
  buildMenu,
  isKill,
  rankByImpact,
  rankFromModel,
} from "@wovain/shared/optimizer/menu";
import type { MenuContext } from "@wovain/shared/optimizer/menu";
import { actionTypes } from "@wovain/shared/optimizer/records";
import type {
  Candidate,
  Entity,
  Finding,
} from "@wovain/shared/optimizer/records";
import {
  applySettingsPatch,
  defaultSettings,
  settingsSchema,
} from "@wovain/shared/settings";
import type { Settings } from "@wovain/shared/settings";
import { describe, expect, test } from "vitest";

const settings = defaultSettings();
const PER_SALE = 10.32;
const HOUR = 3_600_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");
const campaign: Entity = { id: "c1", kind: "campaign" };

const finding = (
  pattern: Finding["pattern"],
  entity: Entity,
  facts: Record<string, number> = {},
  rule = "POD-K1"
): Finding => ({ entity, evidence: [], facts, pattern, rule, settled: true });

const adNoSale = finding(
  "ad_no_sale",
  { id: "a1", kind: "ad" },
  { activeSiblings: 1, perSale: PER_SALE, spendPerDay: 10 }
);
const capped = finding(
  "winner_capped",
  campaign,
  { dailyBudget: 15, marginalCpa: 7, perSale: PER_SALE },
  "POD-B1"
);
const outOfStock = finding(
  "blank_out_of_stock",
  { id: "p1", kind: "product" },
  { spendPerDay: 12 },
  "POD-O1"
);

const context = (overrides: Partial<MenuContext> = {}): MenuContext => ({
  ancestorsOf: (entity) => (entity.kind === "ad" ? [campaign] : []),
  blocks: [],
  day: "2026-10-20",
  settings,
  ...overrides,
});
const types = (menu: Candidate[]) => menu.map((c) => c.id);

describe("buildMenu", () => {
  test("code specifies every candidate, and hold is always there", () => {
    const menu = buildMenu([adNoSale, capped, outOfStock], context());
    expect(types(menu)).toEqual([
      "pause_ad:ad:a1",
      "budget_up:campaign:c1",
      "pause_product_ads:product:p1",
      "hold",
    ]);
    const [pause, up, ops] = menu;
    expect(pause).toMatchObject({
      expectedImpact: { base: 30, unit: "usd" },
      precondition: { status: "ACTIVE" },
      risk: "safe",
      rollback: "resume_ad",
      windowHours: 72,
    });
    expect(pause?.expectedImpact.downside).toBeCloseTo(30 - PER_SALE);
    // +20% of $15 is $3 a day more, at a $7 marginal CPA (downside $10.50).
    expect(up?.amount).toBe(18);
    expect(up?.expectedImpact.base).toBeCloseTo((3 / 7) * PER_SALE - 3);
    expect(up?.expectedImpact.downside).toBeCloseTo((3 / 10.5) * PER_SALE - 3);
    expect(ops).toMatchObject({ risk: "safe", rule: "POD-O1" });
    expect(ops?.windowHours).toBeUndefined();
  });

  test("never pauses the last active ad of a design", () => {
    const last = {
      ...adNoSale,
      facts: { ...adNoSale.facts, activeSiblings: 0 },
    };
    expect(types(buildMenu([last], context()))).toEqual(["hold"]);
  });

  test("an open R1 or R2 block drops kills but not operations pauses", () => {
    const blocks = [{ check: "R1", entityKey: "campaign:c1", since: 0 }];
    expect(
      types(buildMenu([adNoSale, outOfStock], context({ blocks })))
    ).toEqual(["pause_product_ads:product:p1", "hold"]);
  });

  test("a refund spike or tracking gap holds kills and scaling", () => {
    const spike = finding(
      "refund_spike",
      { id: "p1", kind: "product" },
      {},
      "POD-O2"
    );
    expect(types(buildMenu([adNoSale, capped, spike], context()))).toEqual([
      "quality_check:product:p1",
      "hold",
    ]);
    const gap = finding(
      "tracking_gap",
      { id: "shop", kind: "shop" },
      {},
      "POD-M1"
    );
    expect(types(buildMenu([adNoSale, gap], context()))).toEqual([
      "fix_tracking:shop:shop",
      "hold",
    ]);
  });

  test("scaling stops near a season's cutoff", () => {
    const cutoff = finding(
      "seasonal_cutoff",
      { id: "d1", kind: "design" },
      {},
      "POD-S1"
    );
    expect(types(buildMenu([capped, cutoff], context()))).toEqual(["hold"]);
  });

  test("an unsettled kill is proposed, never safe", () => {
    const early = {
      ...adNoSale,
      pattern: "unsettled_spend" as const,
      rule: "POD-K4",
    };
    expect(buildMenu([early], context())[0]).toMatchObject({
      risk: "risky",
      type: "pause_ad",
    });
  });

  test("price and bundle changes are always risky", () => {
    const mix = finding(
      "size_mix_erodes_margin",
      { id: "d1", kind: "design" },
      { newPerSale: 10.67, realized: 5.28, suggestedPrice: 37 },
      "POD-E2"
    );
    const aov = finding(
      "low_aov",
      campaign,
      { bundlePerOrder: 21, perSale: PER_SALE },
      "POD-E4"
    );
    const [price, bundle] = buildMenu([mix, aov], context());
    expect(price).toMatchObject({
      amount: 37,
      risk: "risky",
      type: "price_change",
    });
    expect(price?.expectedImpact.note).toContain("kill line 32.01");
    expect(bundle).toMatchObject({ risk: "risky", type: "bundle_offer" });
    expect(bundle?.expectedImpact.base).toBeCloseTo(21 - 2 * PER_SALE);
  });

  test("operations findings build alerts, and repeated errors pause ads", () => {
    const errors = finding(
      "production_error",
      { id: "p1", kind: "product" },
      { count: 2 },
      "POD-O4"
    );
    const late = finding(
      "fulfillment_delay",
      { id: "p1", kind: "product" },
      { lateShare: 0.6 },
      "POD-O3"
    );
    expect(types(buildMenu([errors, late], context()))).toEqual([
      "ops_alert:product:p1",
      "pause_product_ads:product:p1",
      "budget_down:product:p1",
      "hold",
    ]);
  });

  test("one idempotency key per action per day", () => {
    const today = buildMenu([adNoSale], context())[0]?.idempotencyKey;
    expect(buildMenu([adNoSale], context())[0]?.idempotencyKey).toBe(today);
    expect(
      buildMenu([adNoSale], context({ day: "2026-10-21" }))[0]?.idempotencyKey
    ).not.toBe(today);
  });

  test("kills are judged on sales; operations pauses aren't kills", () => {
    expect(isKill({ rule: "POD-K1", type: "pause_ad" })).toBe(true);
    expect(isKill({ rule: "POD-O3", type: "budget_down" })).toBe(false);
    expect(isKill({ rule: "POD-O1", type: "pause_product_ads" })).toBe(false);
  });
});

describe("ranking", () => {
  const menu = buildMenu([adNoSale, outOfStock], context());

  test("drops ids not on the menu and keeps hold", () => {
    expect(
      types(
        rankFromModel(
          ["delete_campaign", "pause_ad:ad:a1", "pause_ad:ad:a1"],
          menu
        )
      )
    ).toEqual(["pause_ad:ad:a1", "hold"]);
    expect(types(rankFromModel([], menu))).toEqual(["hold"]);
    expect(types(rankFromModel(["hold", "pause_ad:ad:a1"], menu))).toEqual([
      "hold",
      "pause_ad:ad:a1",
    ]);
  });

  test("the code-only fallback ranks by expected impact", () => {
    expect(types(rankByImpact(menu))).toEqual([
      "pause_ad:ad:a1",
      "pause_product_ads:product:p1",
      "hold",
    ]);
  });
});

describe("hard limits", () => {
  test("no action can activate, delete or touch an order", () => {
    for (const type of actionTypes) {
      expect(type).not.toMatch(/activate|delete|order|refund|cancel/u);
    }
  });
});

const on: Settings = applySettingsPatch(settings, {
  optimizer: { autonomy: "safe", enabled: true },
});
const guard = (overrides: Partial<GuardContext> = {}): GuardContext => ({
  activeAdsInDesign: 2,
  ancestors: [campaign],
  blocks: [],
  campaignLaunched: true,
  changes: [],
  dataAt: { fourthwall: NOW - 2 * HOUR, meta: NOW - 80 * HOUR },
  maxDailyBudget: 60,
  now: NOW,
  settings: on,
  ...overrides,
});
const [pauseAd, budgetUp, opsPause] = buildMenu(
  [adNoSale, capped, outOfStock],
  context()
);
const must = (candidate: Candidate | undefined) => {
  if (candidate === undefined) {
    throw new Error("missing candidate");
  }
  return candidate;
};

describe("guardrails", () => {
  test("a clean safe action applies only under safe autonomy", () => {
    expect(violations(must(pauseAd), guard())).toEqual([]);
    expect(canAutoApply(must(pauseAd), guard())).toBe(true);
    const advise = applySettingsPatch(on, {
      optimizer: { autonomy: "advise" },
    });
    expect(canAutoApply(must(pauseAd), guard({ settings: advise }))).toBe(
      false
    );
    const off = applySettingsPatch(on, { optimizer: { enabled: false } });
    expect(violations(must(pauseAd), guard({ settings: off }))).toContain(
      "off"
    );
  });

  test("kills wait for settled data from both sources", () => {
    expect(
      violations(
        must(pauseAd),
        guard({ dataAt: { fourthwall: NOW - 30 * 60_000 } })
      )
    ).toContain("unsettled");
    expect(
      violations(
        must(pauseAd),
        guard({ dataAt: { fourthwall: NOW - 2 * HOUR, meta: NOW - 10 * HOUR } })
      )
    ).toContain("unsettled");
    expect(settledFor({}, NOW, on.optimizer)).toBe(false);
    // Operations pauses rest on stock, not sales: no settle wait.
    expect(violations(must(opsPause), guard({ dataAt: {} }))).toEqual([]);
  });

  test("no kill under a block, and never the last ad", () => {
    const blocks = [{ check: "R2", entityKey: "campaign:c1", since: 0 }];
    expect(violations(must(pauseAd), guard({ blocks }))).toContain(
      "kill_blocked"
    );
    expect(
      violations(must(pauseAd), guard({ activeAdsInDesign: 1 }))
    ).toContain("last_ad");
  });

  test("pauses per day and the cooldown", () => {
    const pauses = Array.from({ length: 3 }, (_, i) => ({
      at: NOW - HOUR,
      kind: "kill_pause" as const,
      objectId: `x${i}`,
    }));
    expect(violations(must(pauseAd), guard({ changes: pauses }))).toContain(
      "pauses_per_day"
    );
    const recent = [
      { at: NOW - 10 * HOUR, kind: "budget" as const, objectId: "a1" },
    ];
    expect(violations(must(pauseAd), guard({ changes: recent }))).toContain(
      "cooldown"
    );
    const old = [
      { at: NOW - 73 * HOUR, kind: "budget" as const, objectId: "a1" },
    ];
    expect(violations(must(pauseAd), guard({ changes: old }))).toEqual([]);
  });

  test("budget moves stay under the cap and the step per day", () => {
    expect(violations(must(budgetUp), guard({ currentBudget: 15 }))).toEqual(
      []
    );
    expect(
      violations(
        must(budgetUp),
        guard({ currentBudget: 15, maxDailyBudget: 17 })
      )
    ).toContain("budget_cap");
    const moved = [
      {
        at: NOW - 30 * HOUR,
        kind: "budget" as const,
        objectId: "other",
        pct: 5,
      },
    ];
    expect(
      violations(must(budgetUp), guard({ changes: moved, currentBudget: 15 }))
    ).toEqual([]);
    const earlier = [
      { at: NOW - 80 * HOUR, kind: "budget" as const, objectId: "c1", pct: 10 },
    ];
    expect(
      violations(must(budgetUp), guard({ changes: earlier, currentBudget: 14 }))
    ).toContain("budget_step");
    expect(
      violations(
        must(budgetUp),
        guard({ campaignLaunched: false, currentBudget: 15 })
      )
    ).toContain("not_launched");
  });

  test("the budget cap defaults from the campaign and never passes $500", () => {
    expect(budgetCap(settings, 2)).toBe(60);
    expect(budgetCap(settings, 100)).toBe(500);
    expect(
      budgetCap(
        applySettingsPatch(settings, { optimizer: { maxDailyBudget: 40 } }),
        5
      )
    ).toBe(40);
    expect(
      settingsSchema.safeParse({ optimizer: { maxDailyBudget: 501 } }).success
    ).toBe(false);
  });

  test("resumes only what wovain paused, prices never under the floor", () => {
    const resume: Candidate = {
      ...must(pauseAd),
      id: "r",
      risk: "safe",
      type: "resume_ad",
    };
    expect(violations(resume, guard())).toContain("not_ours");
    expect(violations(resume, guard({ pausedByOptimizer: true }))).toEqual([]);
    const price: Candidate = {
      ...must(pauseAd),
      amount: 28,
      id: "p",
      risk: "safe",
      type: "price_change",
    };
    expect(violations(price, guard({ priceFloor: 30 }))).toEqual([
      "approval_required",
      "price_floor",
    ]);
    expect(
      violations({ ...price, amount: 31 }, guard({ priceFloor: 30 }))
    ).toEqual(["approval_required"]);
  });
});

describe("optimizer settings", () => {
  test("default off and advise; old documents parse", () => {
    const { optimizer } = settingsSchema.parse({ rules: {} });
    expect(optimizer).toMatchObject({
      autonomy: "advise",
      conversionLagHours: 72,
      disagreementPct: 30,
      enabled: false,
      shopSettleMinutes: 60,
    });
    expect(optimizer.maxDailyBudget).toBeUndefined();
  });
});
