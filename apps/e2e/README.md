# @wovain/e2e

- PR suite (CI's `e2e` job), every provider mocked by MSW (`mocks/`), on a built `apps/web`, a migrated Postgres and the Inngest Dev Server it starts: `pnpm exec turbo run build --filter=web && pnpm --filter @wovain/e2e run test:e2e` (env from `.config/placeholder-env.sh`).
- Nightly real-provider run on next.wovain.com (`.github/workflows/nightly-e2e.yml`, or Run workflow in Actions): the `@smoke` specs as the seeded smoke account, stopping after the designs; failures fail the run and reach PostHog Error Tracking.
