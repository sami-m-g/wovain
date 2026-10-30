import { TEST_CATALOG } from "@wovain/billing/catalog-fixture";
import { TEST_PRICING_RULES } from "@wovain/core/config-fixture";
import { defineConfig } from "vitest/config";

// The flow tests boot PGlite and apply every migration per test: slower
// than unit tests, so a CI runner gets more than vitest's 5 s default. The
// suites that boot it in a beforeEach get the same for their hooks, past
// vitest's 10 s hook default.
export default defineConfig({
  test: {
    env: {
      BILLING_CATALOG: JSON.stringify(TEST_CATALOG),
      PRICING_RULES: JSON.stringify(TEST_PRICING_RULES),
    },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
