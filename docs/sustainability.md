# Sustainability: wovain's Software Carbon Intensity

We measure wovain with the Green Software Foundation's [Software Carbon Intensity](https://sci.greensoftware.foundation/) specification (ISO/IEC 21031:2024):

> SCI = ((E × I) + M) per R

- **R, the functional unit:** one merchant run, from an idea to a paused Meta campaign (design, publish, two ad videos, campaign with its five rules).
- **E, energy:** server time on App Hosting, CI time on GitLab's hosted runners, model calls on Nebius and video generation on fal.
- **I, grid intensity:** location-based, from Google Cloud's 2025 region table: 432 gCO2e/kWh in us-central1 (App Hosting) and 579 in us-east1 (GitLab's hosted Linux runners run in us-east1 and us-east5; we take the dirtier one). Google's 88% carbon-free energy in us-central1 is a market-based figure, which SCI leaves out, so we don't credit it.
- **M, embodied emissions:** a server's share per vCPU-hour, following Cloud Carbon Footprint's method (about 0.71 g per vCPU-hour; estimate).

The `sci` job recomputes it on every `main` pipeline (`apps/ops/src/sci.ts`, `.gitlab/ci/loop.yml`) from the last 7 days and publishes `sci-report.md` as a job artifact. The latest report is at [`/-/jobs/artifacts/main/raw/sci-report.md?job=sci`](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/jobs/artifacts/main/raw/sci-report.md?job=sci). It's also a GitLab metrics report (`sci_gco2e_per_run`), so a merge request shows how the number moves.

## Baseline (2026-10-22)

**14.27 gCO2e per run.** Inputs measured over the 7 days to 2026-10-22: 154.7 s of billable instance time for 58 requests (Cloud Monitoring) and 522 CI minutes over 65 main pipelines (GitLab API).

| Component | gCO2e per run | Basis |
| --- | --- | --- |
| Server (App Hosting, us-central1) | 0.06 | Measured 2.67 s of instance time per request × 40 requests per run (estimated from the playbooks) |
| CI (hosted runners, us-east1) | 2.87 | Measured 522 CI minutes a week ÷ 20 runs a week (assumed volume) |
| Model calls (Nebius) | 0.26 | 2 Nemotron calls × 0.3 Wh (Epoch AI's 2025 per-query estimate; unverified) |
| Video generation (fal) | 11.09 | 2 clips × one H100-minute at 700 W (unverified estimate; fal publishes no energy data) |

Energy coefficients: Cloud Carbon Footprint's Google Cloud figures (0.71–4.26 W per vCPU, taken at the midpoint; 0.392 W per GB; PUE 1.1), all estimates. Video generation dominates and is the least certain number. It's paid per clip, and the merchant approves it in the ad widget.

## What we did to keep it low

| Choice | Effect | How we know |
| --- | --- | --- |
| **Scale to zero** (`minInstances: 0` in `apphosting.yaml`) | About **334 gCO2e a week avoided** against one always-on instance, or 16.7 g per run at 20 runs a week. That's more than a whole run emits. | Measured 154.7 billable seconds in a week, against 604,800 for an always-on instance; same coefficients |
| **Scanners off on scheduled pipelines** (loop and weekly) | 169 scheduled pipelines a week skip SAST, Secret Detection and Dependency Scanning (93 s per pipeline): about **262 CI minutes and 29 gCO2e a week** avoided | Measured scanner durations on a main pipeline; main's own pipelines still scan every change |
| **Only the ops package in ops jobs** (`.ops-job` installs `--filter @wovain/ops`) | The hourly job skips the server, widgets and Firebase CLI installs | Estimate until the first scheduled runs are measured |
| **Filtered Duo triggers** | Flows run only on a person's action or a red `main`: no reviews for Renovate MRs or drafts, no Fix CI/CD on work-in-progress branches | Measured 42.9 credits for 14 flow runs on Oct 21–22 (about 3 credits a run) before the filters |
| **Deterministic code before models** | The scout, verify, shepherd and market scout make no model calls; the market intent and the funnel are assembled from data. `judge_design` decides print size, transparency, title length and colors in code | By construction (`apps/ops`, `apps/server/src/lib/design-judge.ts`) |
| **Checks before credits** | The shepherd checks paths, size and provenance before it asks Duo for a review, and asks once per commit; a failing check hands the MR to a person without spending a review | By construction (`apps/ops/src/shepherd.ts`) |

What it costs to run the loop itself: each hourly job is a short CI run on a hosted runner and shows up in the CI line above, because scheduled pipelines on `main` are counted.

## Limits

- The per-run request count (40) and weekly volume (20 runs) are estimates until real merchants use wovain; the job recomputes everything else each week.
- Model and video energy per call are unverified third-party estimates.
- Duo flow energy isn't included: GitLab publishes no per-session energy figure.
