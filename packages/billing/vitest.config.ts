import { defineConfig } from "vitest/config";

import { TEST_CATALOG } from "./src/catalog-fixture.ts";

// PGlite boots Postgres in WebAssembly and applies every migration once per
// test file; on a busy CI runner that takes longer than vitest's defaults.
export default defineConfig({
  test: {
    env: { BILLING_CATALOG: JSON.stringify(TEST_CATALOG) },
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
