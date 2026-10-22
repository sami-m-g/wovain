# Verify: measure software carbon intensity on every main pipeline

## Tests added

- `apps/ops/test/sci.test.ts`: the parts add up to the total, the measured week gives 14.27 g per run, no traffic means no server energy, more CI time raises the number, and the report states the formula and labels its estimates.

## Checks run

- `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test` (64 ops tests): pass.
- Baseline computed locally from real data on 2026-10-22: 154.7 billable instance seconds and 58 requests (Cloud Monitoring), 31,335 CI seconds over 65 main pipelines (GitLab API): 14.27 gCO2e per run.
- Scanner durations on a recent main pipeline: semgrep-sast 39 s, secret_detection 14 s, gemnasium-dependency_scanning 40 s.
- Grid intensities from Google Cloud's region table (2025): us-central1 432, us-east1 579 gCO2e/kWh.

## Review findings

Self-review: every constant cites its source; estimates are labeled in the report, the README and `docs/sustainability.md`.

## Try it

After merge, the `sci` job runs in `.post` of the `main` pipeline; open its "SCI report" artifact, or the latest at `/-/jobs/artifacts/main/raw/sci-report.md?job=sci`.

## Departures from the plan

None.
