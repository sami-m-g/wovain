import { describe, expect, it } from "vitest";

import {
  ACTION_TYPES,
  ACTIONS,
  canAutoExecute,
  DEFAULT_AUTONOMY,
} from "./autonomy";
import type { AutonomyLevel, AutonomySettings } from "./autonomy";

const settings = (
  level: AutonomyLevel,
  overrides: Partial<AutonomySettings> = {}
): AutonomySettings => ({
  dailySpendCapCents: 5000,
  level,
  monthlySpendCapCents: 50_000,
  paused: false,
  ...overrides,
});

const verdict = (
  type: string,
  level: AutonomyLevel,
  overrides: Partial<AutonomySettings> = {},
  spendCents?: number
) => canAutoExecute({ spendCents, type }, settings(level, overrides)).verdict;

describe("canAutoExecute", () => {
  it("lets every level read", () => {
    for (const level of ["suggest", "draft", "publish_ads_paused"] as const) {
      expect(verdict("store.report.read", level)).toBe("allow");
    }
  });

  it("suggest runs no write on its own", () => {
    expect(verdict("store.product.create_hidden", "suggest")).toBe(
      "needs_approval"
    );
    expect(verdict("store.product.publish", "suggest")).toBe("needs_approval");
  });

  it("draft runs reversible, invisible actions only", () => {
    expect(verdict("store.product.create_hidden", "draft")).toBe("allow");
    expect(verdict("media.campaign.create_paused", "draft")).toBe("allow");
    expect(verdict("store.product.publish", "draft")).toBe("needs_approval");
  });

  it("publish_ads_paused publishes but never starts spend", () => {
    expect(verdict("store.product.publish", "publish_ads_paused")).toBe(
      "allow"
    );
    expect(verdict("store.drop.publish", "publish_ads_paused")).toBe("allow");
    expect(
      verdict("media.campaign.activate", "publish_ads_paused", {}, 1000)
    ).toBe("needs_approval");
    expect(verdict("media.budget.change", "publish_ads_paused", {}, 0)).toBe(
      "needs_approval"
    );
  });

  it("always asks for refunds and cancels, at every level", () => {
    for (const level of ["suggest", "draft", "publish_ads_paused"] as const) {
      expect(
        canAutoExecute({ type: "store.order.refund" }, settings(level))
      ).toEqual({ reason: "always_approve", verdict: "needs_approval" });
      expect(verdict("store.order.cancel", level)).toBe("needs_approval");
    }
  });

  it("always asks for destructive actions", () => {
    expect(verdict("store.product.archive", "publish_ads_paused")).toBe(
      "needs_approval"
    );
    expect(verdict("store.site.set_status", "publish_ads_paused")).toBe(
      "needs_approval"
    );
  });

  it("asks for everything but reads while the merchant paused the agent", () => {
    const paused = { paused: true };
    expect(verdict("store.product.publish", "publish_ads_paused", paused)).toBe(
      "needs_approval"
    );
    expect(verdict("store.product.create_hidden", "draft", paused)).toBe(
      "needs_approval"
    );
    expect(verdict("store.report.read", "draft", paused)).toBe("allow");
  });

  it("denies spend past the daily cap", () => {
    expect(
      canAutoExecute(
        { spendCents: 2000, type: "media.campaign.activate" },
        settings("publish_ads_paused"),
        { monthCents: 10_000, todayCents: 4000 }
      )
    ).toEqual({ reason: "over_daily_cap", verdict: "deny" });
  });

  it("denies spend past the monthly cap", () => {
    expect(
      canAutoExecute(
        { spendCents: 1000, type: "media.budget.change" },
        settings("publish_ads_paused"),
        { monthCents: 49_500, todayCents: 0 }
      )
    ).toEqual({ reason: "over_monthly_cap", verdict: "deny" });
  });

  it("denies any spend with the default caps of zero", () => {
    expect(
      canAutoExecute(
        { spendCents: 500, type: "media.campaign.activate" },
        DEFAULT_AUTONOMY
      ).verdict
    ).toBe("deny");
  });

  it("denies an action outside the catalog", () => {
    expect(
      canAutoExecute({ type: "store.everything.delete" }, settings("draft"))
    ).toEqual({ reason: "unknown_action", verdict: "deny" });
  });

  it("classes every money-moving store action R4", () => {
    const r4 = ACTION_TYPES.filter((type) => ACTIONS[type].risk === "R4");
    expect(r4).toEqual(
      expect.arrayContaining(["store.order.cancel", "store.order.refund"])
    );
  });
});
