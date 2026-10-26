import { defineConfig } from "vitest/config";

// The flow tests boot PGlite and apply every migration per test: slower
// than unit tests, so a CI runner gets more than vitest's 5 s default.
export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
