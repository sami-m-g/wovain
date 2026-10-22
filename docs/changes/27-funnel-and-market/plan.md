# Plan: count the product funnel and scout the market weekly

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/src/lib/funnel.ts` (new), `routes/mcp.ts`, `routes/connect.ts`, `telemetry.ts`, `apps/server/package.json`: the metric.
- `apps/ops/src/{records,analysis,weekly}.ts` (new), `gitlab.ts` (credits), `apps/ops/package.json`: the weekly job.
- `.gitlab/ci/loop.yml`, `.config/knip.json`: the job and its entry.
- `infra/index.ts`, `infra/gitlab.ts`: role, variable, schedule.
- `README.md`, `docs/spec.md`.

## Order of work

1. `stepOf` and `countStep` with tests, then wire them in.
2. The meter provider and shutdown flush.
3. Pure analysis with tests; the records reader checked against production with my own credentials.
4. Weekly entry, CI and infra; `pnpm infra:preview`.

## Risks

- A scaled-to-zero instance can lose a count if Cloud Run kills it without SIGTERM; the weekly analysis reads records, which are the source of truth, so the digest doesn't depend on the metric.
- Credits need the token owner in the root namespace; otherwise the report says "not readable".

## Tests that prove it

- `apps/server/test/unit/funnel.test.ts`, `apps/ops/test/analysis.test.ts`; the default check set.
