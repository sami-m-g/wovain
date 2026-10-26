import { expect, it, vi } from "vitest";

import { BILLING_PAID_PLANS } from "../src/flags";
import { createBilling } from "../src/service";

const env = {
  BETTER_AUTH_URL: "http://localhost:3001",
  POLAR_ENVIRONMENT: "sandbox" as const,
};

it("keeps paid plans off unless the flag is on", () => {
  expect(createBilling(env).paidPlans()).toBe(false);
  const isFlagOn = vi.fn((flag: string) => flag === BILLING_PAID_PLANS);
  expect(createBilling(env, isFlagOn).paidPlans()).toBe(true);
  expect(isFlagOn).toHaveBeenCalledWith("billing-paid-plans");
});
