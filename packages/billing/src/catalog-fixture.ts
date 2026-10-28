import type { z } from "zod";

import type { billingCatalogSchema } from "./catalog.ts";

// The catalog the tests run with (vitest.config.ts sets BILLING_CATALOG to
// it): production's values when it was written, so the tests read like the
// product. Deployed environments get theirs from Pulumi config.
export const TEST_CATALOG = {
  creditCost: { assist: 1, design: 2, research: 3 },
  creditPack: { credits: 100, name: "Credit pack", priceCents: 1000 },
  designsPerRun: 3,
  plans: {
    free: {
      autopilot: false,
      autopilotDailyCredits: 15,
      monthlyCredits: 15,
      name: "Free",
      priceCents: 0,
      rank: 0,
      rollover: false,
    },
    label: {
      autopilot: true,
      autopilotDailyCredits: 100,
      monthlyCredits: 1000,
      name: "Label",
      priceCents: 7900,
      rank: 2,
      rollover: true,
    },
    studio: {
      autopilot: true,
      autopilotDailyCredits: 30,
      monthlyCredits: 300,
      name: "Studio",
      priceCents: 2900,
      rank: 1,
      rollover: false,
    },
  },
  promoCentsPerCredit: 10,
  promos: [
    {
      audience:
        "Hackathon judges: the code is shared only in Devpost's private testing instructions.",
      credits: 300,
      enabled: true,
      endsAt: "2026-12-16T23:59:59Z",
      id: "judges-2026",
      maxRedemptions: 50,
      name: "Judges 2026",
    },
    {
      audience:
        "Launch: a public code for the first creators, once paid plans are on.",
      credits: 50,
      enabled: false,
      endsAt: "2027-03-31T23:59:59Z",
      id: "launch-2027",
      maxRedemptions: 500,
      name: "Launch 2027",
      startsAt: "2027-01-15T00:00:00Z",
    },
    {
      audience:
        "The judges' shared demo account on next.wovain.com: the code is shared only in Devpost's private testing instructions.",
      credits: 300,
      emails: ["judges@wovain.com"],
      enabled: true,
      endsAt: "2026-12-31T23:59:59Z",
      id: "judges-account-2026",
      maxRedemptions: 1,
      name: "Judges account 2026",
    },
  ],
  redeemLimit: { attempts: 5, windowSeconds: 600 },
  runsPerMerchant: 2,
} satisfies z.input<typeof billingCatalogSchema>;
