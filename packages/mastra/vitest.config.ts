import { TEST_PRICING_RULES } from "@wovain/core/config-fixture";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { PRICING_RULES: JSON.stringify(TEST_PRICING_RULES) },
  },
});
