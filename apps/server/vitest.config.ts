import { defineConfig } from "vitest/config";

// unit: pure logic, no services. integration: the store and the MCP tools
// against the Firestore and Storage emulators (`pnpm test:integration`).
// live: real model calls (Nemotron on Nebius), opt-in with `pnpm test:live`
// and skipped without NEBIUS_API_KEY.
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { include: ["test/unit/**/*.test.ts"], name: "unit" },
      },
      {
        extends: true,
        test: {
          include: ["test/integration/**/*.test.ts"],
          name: "integration",
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          include: ["test/live/**/*.test.ts"],
          name: "live",
          testTimeout: 120_000,
        },
      },
    ],
  },
});
