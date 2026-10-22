# Verify: turn Duo on and close the self-healing loop

## Tests added

- `apps/ops/test/signals.test.ts`: normalization groups the same error, redaction removes tokens, keys, emails and JWTs, grouping merges sources, the issue body carries a fingerprint the next run finds, and the verification rule waits for time and traffic, verifies an 80% drop and reports a regression only after 24 hours.
- `apps/ops/test/guardrails.test.ts`: the allowlist (application source and tests pass; `apps/ops`, infra, CI, config, dependencies, auth, routes, store, agent files and docs don't), size, conflicts, pipeline and provenance blockers, review freshness (a review of an older commit or none blocks; diff notes name their commit; general notes map to the MR version current then), and provenance (an issue a person filed, an MR a person wrote, an MR bound only by text, and a session someone else started, from before the assignment or for another MR are each rejected).

## Checks run

- `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm build`: pass.
- `pnpm test`: 51 ops tests and 86 server tests pass.
- `pnpm infra:preview` (read only): 14 to create (the `gitlab-ops` account and its trust and roles, the logging and monitoring APIs, the `operations` environment, the `wovain loop` schedule and its three variables, the `verified` label, two CI variables), 3 to update (the triggers turn active). No replacements or imports.
- A local read with my own Google credentials: Cloud Logging returned no ERROR entries for the last 7 days; Cloud Monitoring counted 58 requests and 154.7 billable instance seconds.
- Duo sessions: the GraphQL `duoWorkflowWorkflows` query returns `workflowDefinition`, `sourceType` (`FLOW_TRIGGER`), the triggering `user`, `workItem` and `mergeRequestLinks` for this project's past Code Review and Fix CI/CD runs.

## Review findings

A review agent read the first version and the coordinator's security review flagged auto-merge. Both were fixed before the MR opened:

- Guardrails were a denylist and didn't cover `apps/ops` itself: now an allowlist of application source and tests, with `.gitlab/CODEOWNERS` sections for the loop, config and dependency paths.
- The MR was bound to its issue by `#N` text: now by GitLab's `closes_issues` or the source branch, plus the issue's author, marker, label and assignment, the MR's author, and a Developer session the loop's assignment started (sessions API).
- Review freshness compared commit dates: now the reviewed commit (diff note `head_sha` or MR versions) must equal the head `sha`.
- `head_pipeline` isn't in the MR list response: the single MR is fetched, and the pipeline must be on the head `sha` in an allowed state.
- Reviews could be re-requested hourly: once per head commit (marker note), with a 2-hour timeout to a person, and Duo is added to existing reviewers instead of replacing them.
- One failing source aborted the run: GitLab Observability failures are caught, each issue and MR settles on its own, and each phase is isolated and reported.
- Issue titles weren't redacted: they are now.
- Retries were off by one, notes were read oldest first, and a verified problem that came back was never re-filed: all fixed.

Not changed, and written down in `docs/loop.md` (Known limits): read caps per window and the Cloud Logging read cost of verification.

## Try it

After merge, CI applies `infra/` and the schedule runs at :17 each hour. To run it now: CI/CD → Schedules → "wovain loop" → Run. The job log prints the report; `FORCE_DIGEST=1` as a variable on a manual run also posts it to the `digest` issue. The proof run seeds a small bug and follows it through `docs/loop.md`.

## Departures from the plan

- The MR is bound to its issue by GitLab, not by `Related to #N`: the issue now asks for `Closes #N` and a branch named for the issue, and the scout still verifies after the merge closes it (it reopens on a regression).
- The guardrails became an allowlist with provenance and review-freshness checks, after the security review.
