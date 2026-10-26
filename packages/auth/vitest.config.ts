import { defineConfig } from "vitest/config";

// The webhook tests run on PGlite (Postgres in WebAssembly) with every
// migration applied; on a busy CI runner that takes longer than the defaults.
export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
