import { defineConfig } from "vitest/config";

// Offline evals (src/evals/*.eval.ts): slow, and they call the model, so
// they run only through `pnpm --filter @wovain/mastra evals`, never with the
// unit tests.
export default defineConfig({
  test: {
    include: ["src/evals/**/*.eval.ts"],
    testTimeout: 600_000,
  },
});
