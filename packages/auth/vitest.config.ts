import { TEST_CATALOG } from "@wovain/billing/catalog-fixture";
import { defineConfig } from "vitest/config";

// The webhook tests run on PGlite (Postgres in WebAssembly) with every
// migration applied; on a busy CI runner that takes longer than the defaults.
export default defineConfig({
  test: {
    // The webhooks read the catalog's promos, as in packages/billing.
    env: { BILLING_CATALOG: JSON.stringify(TEST_CATALOG) },
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
