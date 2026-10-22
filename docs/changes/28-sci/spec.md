# Spec: measure software carbon intensity on every main pipeline

Intent: [intent.md](intent.md)

## Requirements

1. SCI = ((E × I) + M) per R, with R one idea-to-paused-campaign run, computed from four parts: server, CI, model calls and video generation.
2. Server and CI time are measured over the last 7 days (Cloud Monitoring `billable_instance_time` and `request_count`; job durations of `main` pipelines); the rest are cited estimates.
3. A `sci` job on every `main` pipeline writes `sci-report.md`, `sci.json` and a `metrics.txt` metrics report as artifacts.
4. `docs/sustainability.md` and the README give the baseline and the gains.

## Design

- `apps/ops/src/sci.ts`: pure computation and report; constants carry their source (Google's region table, Cloud Carbon Footprint's coefficients, Epoch AI's per-query estimate, an H100-minute per clip).
- `apps/ops/src/sci-report.ts`: reads the measurements and writes the files.
- `.gitlab/ci/templates.yml`: `.gcp-credentials` (the WIF file only) and `.ops-job` (installs only `@wovain/ops`), so ops jobs don't install the whole workspace; `loop`, `weekly` and `sci` use it.

## Areas of concern

- Honesty: the report and docs label every estimate; market-based CFE isn't credited, as SCI requires.
- No new permissions: the `gitlab-ops` account already reads metrics.
