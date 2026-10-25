import { EvlogError } from "evlog";
import { describe, expect, it } from "vitest";

import {
  createSpendPolicy,
  isAllowlisted,
  refusal,
  refusalError,
  STEP_COST_USD,
  startOfUtcDay,
} from "./spend";

const policy = createSpendPolicy({
  SPEND_DAILY_CAP_USD: 5,
  SPEND_IMAGES_PER_RUN: 4,
  SPEND_RUNS_PER_DAY: 2,
  WOVAIN_ALLOWED_EMAILS: " Founder@wovain.com , judge@example.com,",
});

const fresh = {
  emailVerified: true,
  images: 0,
  runsToday: 0,
  spentTodayUsd: 0,
};

describe("allowlist", () => {
  it("matches listed emails whatever their case and spacing", () => {
    expect(isAllowlisted(policy, "founder@WOVAIN.com")).toBe(true);
    expect(isAllowlisted(policy, " judge@example.com")).toBe(true);
    expect(isAllowlisted(policy, "stranger@example.com")).toBe(false);
    expect(policy.allowed.has("")).toBe(false);
  });

  it("allowlists no one when the variable is unset", () => {
    const open = createSpendPolicy({
      SPEND_DAILY_CAP_USD: 5,
      SPEND_IMAGES_PER_RUN: 4,
      SPEND_RUNS_PER_DAY: 2,
    });
    expect(isAllowlisted(open, "founder@wovain.com")).toBe(false);
  });
});

describe("quota", () => {
  it("allows runs and images under the limits", () => {
    expect(refusal(policy, "run", { ...fresh, runsToday: 1 })).toBeUndefined();
    expect(refusal(policy, "image", { ...fresh, images: 3 })).toBeUndefined();
  });

  it("refuses a third run a day and a fifth image a run", () => {
    expect(refusal(policy, "run", { ...fresh, runsToday: 2 })).toBe(
      "daily_limit"
    );
    expect(refusal(policy, "image", { ...fresh, images: 4 })).toBe(
      "daily_limit"
    );
    // Nemotron's extra calls ride on a run already counted.
    expect(
      refusal(policy, "llm", { ...fresh, images: 9, runsToday: 9 })
    ).toBeUndefined();
  });

  it("asks for a verified email before any paid step", () => {
    expect(refusal(policy, "run", { ...fresh, emailVerified: false })).toBe(
      "email_not_verified"
    );
  });
});

describe("global cap", () => {
  it("refuses every paid step once today's spend would pass the cap", () => {
    const spentTodayUsd = 5 - STEP_COST_USD.llm / 2;
    for (const kind of ["image", "llm", "run"] as const) {
      expect(refusal(policy, kind, { ...fresh, spentTodayUsd })).toBe(
        "spend_cap"
      );
    }
    expect(
      refusal(policy, "image", { ...fresh, spentTodayUsd: 1 })
    ).toBeUndefined();
  });

  it("resets at midnight UTC", () => {
    expect(startOfUtcDay(new Date("2026-10-25T23:59:59-05:00"))).toEqual(
      new Date("2026-10-26T00:00:00Z")
    );
  });
});

describe("refusalError", () => {
  it("is a 429 in the merchant's language, with the fix", () => {
    const error = refusalError("daily_limit", policy, "fr");
    expect(EvlogError.isEvlogError(error)).toBe(true);
    expect(error.code).toBe("DAILY_LIMIT");
    expect(error.status).toBe(429);
    expect(error.message).toBe("Vous avez atteint la limite gratuite du jour");
    expect(error.why).toBe("2 runs a day, 4 images a run.");
    expect(refusalError("spend_cap", policy, "de").message).toBe(
      "wovain has reached today's free generation budget"
    );
  });
});
