import { defineConfig } from "vitest/config";

// unit: pure logic, no services. integration: the store and the MCP tools
// against the Firestore and Storage emulators (`pnpm test:integration`).
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
    ],
  },
});
