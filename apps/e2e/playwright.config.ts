import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// Two suites over the same specs:
// - pr: the app built in CI (apps/web standalone) on the CI database, with
//   every outside provider answered by MSW inside the server (./mocks).
// - smoke: next.wovain.com after each deploy, with real providers and the
//   seeded smoke account (src/seed-smoke.ts); only specs tagged @smoke.
// Never point either at wovain.com: production is frozen.
// The app's own origin, which is compiled into the build.
const PR_URL = process.env["BETTER_AUTH_URL"] ?? "http://localhost:3001";
const smokeUrl = process.env["E2E_BASE_URL"];
if (smokeUrl !== undefined && new URL(smokeUrl).hostname === "wovain.com") {
  throw new Error("The smoke suite never targets production (wovain.com).");
}
const mocks = fileURLToPath(new URL("mocks/server.ts", import.meta.url));
const web = fileURLToPath(new URL("../web", import.meta.url));
// apps/web's standalone build started as its Dockerfile does (Varlock loads
// and checks the env), plus MSW in the server process.
const STANDALONE = ".next/standalone/apps/web";
const startWeb = [
  `mkdir -p public && cp -R .next/static ${STANDALONE}/.next/ && cp -R public ${STANDALONE}/`,
  `node --import varlock/auto-load --import ${mocks} ${STANDALONE}/server.js`,
].join(" && ");
const isCI = process.env["CI"] !== undefined;
const INNGEST_CLI = "1.49.0";

export default defineConfig({
  // A production build answers each route's first request a little slower.
  expect: { timeout: 10_000 },
  forbidOnly: isCI,
  fullyParallel: true,
  projects: [
    {
      name: "pr",
      use: { ...devices["Desktop Chrome"], baseURL: PR_URL },
    },
    {
      grep: /@smoke/u,
      name: "smoke",
      retries: 1,
      use: { ...devices["Desktop Chrome"], baseURL: smokeUrl },
    },
  ],
  reporter: isCI
    ? [
        ["github"],
        ["html", { open: "never" }],
        // Smoke failures also reach PostHog Error Tracking.
        ["./src/posthog-reporter.ts"],
      ]
    : "list",
  retries: isCI ? 1 : 0,
  testDir: "tests",
  use: { trace: "retain-on-failure" },
  // Only the pr suite starts the app; the smoke suite sets E2E_BASE_URL.
  webServer:
    smokeUrl === undefined
      ? [
          {
            command: startWeb,
            cwd: web,
            // The provider keys only need to exist: MSW answers the calls.
            // Varlock refuses a response that contains a secret, so none is
            // a common word. A canned model reply can't grade text, so the
            // guardrails and the sampled scorers are off.
            env: {
              FAL_KEY: "msw-fal-key-placeholder",
              GUARDRAILS: "off",
              INNGEST_DEV: "1",
              NEBIUS_API_KEY: "msw-nebius-api-key-placeholder",
              POLAR_ACCESS_TOKEN: "msw-polar-access-token-placeholder",
              PORT: new URL(PR_URL).port,
              QLOO_API_KEY: "msw-qloo-api-key-placeholder",
              SCORER_SAMPLE_RATE: "0",
              TAVILY_API_KEY: "msw-tavily-api-key-placeholder",
            },
            reuseExistingServer: !isCI,
            url: `${PR_URL}/api/auth/ok`,
          },
          {
            // Runs execute on the durable engine (docs/adr/0001).
            command: `pnpm dlx inngest-cli@${INNGEST_CLI} dev --no-discovery -u ${PR_URL}/api/inngest`,
            reuseExistingServer: !isCI,
            url: "http://127.0.0.1:8288",
          },
        ]
      : [],
});
