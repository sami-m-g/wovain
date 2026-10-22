# Verify: count the product funnel and scout the market weekly

## Tests added

- `apps/server/test/unit/funnel.test.ts`: each tool call maps to its step (or none), and `countStep` records the counter with only the step as an attribute (in-memory metric exporter).
- `apps/ops/test/analysis.test.ts`: merchants per step, the biggest drop-off (and none without data), cost estimates, the report table, and redaction of web titles in the market intent.

## Checks run

- `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm build`, `pnpm test` (60 ops, 97 server): pass.
- `pnpm infra:preview` (read only, on top of !50): 20 to create, 3 to update; this MR adds the `weekly` schedule and its 3 variables, the `gitlab-analytics` account, its trust, roles, `analytics` environment and `GCP_ANALYTICS_SERVICE_ACCOUNT`, and `TAVILY_API_KEY`. A security review moved Firestore access off `gitlab-ops` onto that account, and market-scout titles and links are now sanitized (`safeText`, `safeUrl`: http(s) only, link-breaking characters encoded, newlines and markdown control characters stripped), with tests.
- The records reader against production with my own credentials: no merchant records yet (a collection-group count of `design` is 0), so the first digest will say "no merchants yet".
- `currentUser.creditsUsage(namespacePath: "gitlab-ai-hackathon")` returned 42.885 credits for October.

## Review findings

Self-review only: the reads use field masks, the Tavily URLs are filtered to http(s), and the credits read falls back to "not readable".

## Try it

After merge: CI/CD → Schedules → "wovain weekly" → Run. The job log prints the analysis; the digest issue gets the same comment, and a `market scout: week of …` intent appears with `status::intent`. In GitLab Observability, the metric `wovain.funnel.events` appears once a merchant reaches a step.

## Departures from the plan

None.
