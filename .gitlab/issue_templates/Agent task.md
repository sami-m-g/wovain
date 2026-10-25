<!-- A task for GitLab Duo's Developer flow (docs/flows.md, flow 3). Be concrete: the agent knows only what is written here and in the repo. The agent::task label below hands it to Duo once wovain ops sees it (every 10 minutes): only when a trusted user (TRUSTED_USERS) added the label, nobody edited the issue afterwards, and only trusted users commented. Duo's merge request is reviewed by Duo Code Review and auto-merged when the pipeline is green and it stays inside the guardrails (apps/ops/src/guardrails.ts). -->

## Goal

<!-- One sentence: the change to make and why. -->

## Acceptance criteria

<!-- Checkable statements. The agent should not open the MR until all of them hold. -->

- [ ]
- [ ] `pnpm run check`, `pnpm run check-types`, `pnpm run knip` and `pnpm run test` pass

## Files likely involved

<!-- Paths, e.g. apps/web/src/lib/checkout/quote.ts, packages/api/src/routers/index.ts. -->

-

## Constraints

- Follow AGENTS.md (Ultracite style, Conventional Commit titles, catalog versions).
- A bug fix comes with a test that fails without it.
- Keep it small: auto-merge allows at most 10 files and 200 changed lines in `apps/web/src`, `apps/web/test` and `packages/api/src/routers`.

## Out of scope

- Auth, database schema and migrations, infra, CI, dependencies and secrets.

/label ~"agent::task"
