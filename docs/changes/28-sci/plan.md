# Plan: measure software carbon intensity on every main pipeline

Spec: [spec.md](spec.md)

## Files that change

- `apps/ops/src/sci.ts`, `apps/ops/src/sci-report.ts`, `apps/ops/src/gitlab.ts` (pipelines and job durations), `apps/ops/test/sci.test.ts`.
- `.gitlab/ci/templates.yml`, `.gitlab/ci/loop.yml`, `.config/knip.json`.
- `docs/sustainability.md`, `README.md`.

## Order of work

1. The formula with tests.
2. Measure the baseline locally (Cloud Monitoring with my credentials, the GitLab API through glab).
3. The job, the slimmer ops template, the docs.

## Risks

- The `--filter @wovain/ops` install must still give the scripts every import; the job fails loudly if not.

## Tests that prove it

- `apps/ops/test/sci.test.ts`; the default check set; the CI lint API on the branch.
