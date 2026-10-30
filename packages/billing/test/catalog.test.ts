import { expect, it } from "vitest";

import {
  billingCatalog,
  parseBillingCatalog,
  publicCatalog,
} from "../src/catalog";
import { TEST_CATALOG } from "../src/catalog-fixture";

// BILLING_CATALOG is required and validated: no default stands in for it.

it("reads the catalog from BILLING_CATALOG", () => {
  const catalog = billingCatalog();
  expect(catalog.plans.studio).toMatchObject({
    code: "studio",
    name: "Studio",
  });
  expect(catalog.creditPack.code).toBe("pack");
  expect(catalog.redeemLimit).toEqual({ attempts: 5, windowSeconds: 600 });
});

it("refuses a missing catalog, naming the variable", () => {
  expect(() => parseBillingCatalog()).toThrow(/BILLING_CATALOG is not set/u);
  expect(() => parseBillingCatalog(" ")).toThrow(/BILLING_CATALOG is not set/u);
});

it("refuses a catalog that leaves something out", () => {
  const { runsPerMerchant: _, ...partial } = TEST_CATALOG;
  expect(() => parseBillingCatalog(JSON.stringify(partial))).toThrow(
    /BILLING_CATALOG is invalid/u
  );
});

it("refuses a promo that carries its code: codes live only in Polar", () => {
  const [judges] = TEST_CATALOG.promos;
  const leaked = {
    ...TEST_CATALOG,
    promos: [{ ...judges, code: "LEAKED" }],
  };
  expect(() => parseBillingCatalog(JSON.stringify(leaked))).toThrow(
    /BILLING_CATALOG is invalid/u
  );
});

it("keeps the promos out of what the browser sees", () => {
  expect(Object.keys(publicCatalog(billingCatalog())).toSorted()).toEqual([
    "creditCost",
    "creditPack",
    "designsPerRun",
    "plans",
  ]);
});
