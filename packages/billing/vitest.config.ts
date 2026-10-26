import { defineConfig } from "vitest/config";

// PGlite boots Postgres in WebAssembly and applies every migration once per
// test file; on a busy CI runner that takes longer than vitest's defaults.
export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
