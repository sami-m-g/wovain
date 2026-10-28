import { expect, it } from "vitest";

import { promoSecretId, promoSecretIdFor } from "../src/promos";

// Where the seed writes a promo's code. next shares production's GCP
// project, so its secrets must never be production's.

it("keeps production's secret ids exactly as they are", () => {
  expect(promoSecretIdFor("judges-2026", "wovain")).toBe(
    "polar-promo-judges-2026"
  );
  // Without POLAR_METADATA_KEY the key is the plain `wovain`.
  expect(promoSecretId("judges-2026")).toBe("polar-promo-judges-2026");
});

it("gives an environment with its own metadata key its own secret ids", () => {
  expect(promoSecretIdFor("judges-2026", "wovain:next")).toBe(
    "polar-promo-judges-2026-next"
  );
  expect(promoSecretIdFor("judges-account-2026", "wovain:next")).toBe(
    "polar-promo-judges-account-2026-next"
  );
  expect(promoSecretIdFor("judges-2026", "wovain:Pr 12")).toBe(
    "polar-promo-judges-2026-pr-12"
  );
});
