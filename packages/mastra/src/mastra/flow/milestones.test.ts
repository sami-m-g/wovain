import { describe, expect, it } from "vitest";

import { journeyOf, TARGETS } from "./milestones";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 29, 12, minutes));

describe("journeyOf", () => {
  it("times the live campaign from sign-up and the profit from delivery", () => {
    const journey = journeyOf({
      campaign_delivering: at(40),
      campaign_started: at(8),
      first_profitable_product: at(70),
      signed_up: at(0),
    });
    expect(journey.timeToLiveCampaignMinutes).toBe(8);
    expect(journey.metaReviewMinutes).toBe(32);
    expect(journey.timeToFirstProfitMinutes).toBe(30);
    expect(journey.timeToLiveCampaignMinutes).toBeLessThanOrEqual(
      TARGETS.timeToLiveCampaign
    );
    expect(journey.timeToFirstProfitMinutes).toBeLessThanOrEqual(
      TARGETS.timeToFirstProfit
    );
  });

  it("leaves a KPI unknown until both of its steps happened", () => {
    const journey = journeyOf({ campaign_started: at(5), signed_up: at(0) });
    expect(journey.timeToLiveCampaignMinutes).toBe(5);
    expect(journey.metaReviewMinutes).toBeUndefined();
    expect(journey.timeToFirstProfitMinutes).toBeUndefined();
  });
});
