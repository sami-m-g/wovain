import { defineConfig } from "vitest/config";

import { TEST_PRICING_RULES } from "./src/config-fixture";

export default defineConfig({
  test: {
    env: { PRICING_RULES: JSON.stringify(TEST_PRICING_RULES) },
  },
});
