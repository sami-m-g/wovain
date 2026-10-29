import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node's own import and type stripping, as `pulumi up` runs index.ts, so
    // failures only Node shows (dynamic provider serialization) show up here.
    experimental: { viteModuleRunner: false },
    include: [
      "*.test.ts",
      "bootstrap/*.test.ts",
      "next/*.test.ts",
      "github/*.test.ts",
    ],
    testTimeout: 60_000,
  },
});
