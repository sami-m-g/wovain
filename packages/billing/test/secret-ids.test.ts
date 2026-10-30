import { expect, it } from "vitest";

import { environmentSecretId } from "../src/plans";
import { promoSecretId } from "../src/promos";

// Each environment writes its own Secret Manager secrets, so seeding next
// never adds a version to production's.

it("keeps production's secret IDs as they are", () => {
  expect(promoSecretId("judges-2026", "wovain")).toBe(
    "polar-promo-judges-2026"
  );
  expect(environmentSecretId("polar-webhook-secret", "wovain")).toBe(
    "polar-webhook-secret"
  );
});

it("uses production's IDs when POLAR_METADATA_KEY is not set", () => {
  expect(promoSecretId("judges-2026")).toBe("polar-promo-judges-2026");
  expect(environmentSecretId("polar-webhook-secret")).toBe(
    "polar-webhook-secret"
  );
});

it("gives another environment its own IDs", () => {
  expect(promoSecretId("judges-account-2026", "wovain:next")).toBe(
    "polar-promo-judges-account-2026-next"
  );
  expect(environmentSecretId("polar-webhook-secret", "wovain:next")).toBe(
    "polar-webhook-secret-next"
  );
  expect(promoSecretId("judges-2026", "wovain:pr 7")).toBe(
    "polar-promo-judges-2026-pr-7"
  );
});

it("refuses a key that names no environment", () => {
  expect(() => promoSecretId("judges-2026", "wovain:")).toThrow(
    /names no environment/u
  );
});
