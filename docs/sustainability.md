# Sustainability: wovain's Software Carbon Intensity

We measure wovain with the Green Software Foundation's [Software Carbon Intensity](https://sci.greensoftware.foundation/) specification (ISO/IEC 21031:2024):

> SCI = ((E × I) + M) per R

- **R, the functional unit:** one merchant run, from an idea to a paused Meta campaign (design, publish, one 5-second ad video cropped to 1:1, 4:5 and 9:16, campaign with its five rules).
- **E, energy:** server time on App Hosting, CI time on GitLab's hosted runners, model calls on Nebius and video generation on fal.
- **I, grid intensity:** location-based, from Google Cloud's 2025 region table: 432 gCO2e/kWh in us-central1 (App Hosting) and 579 in us-east1 (GitLab's hosted Linux runners run in us-east1 and us-east5; we take the dirtier one). Google's 88% carbon-free energy in us-central1 is a market-based figure, which SCI leaves out, so we don't credit it.
- **M, embodied emissions:** a server's share per vCPU-hour, following Cloud Carbon Footprint's method (about 0.71 g per vCPU-hour; estimate).

The `sci` job recomputes it on every `main` pipeline (`apps/ops/src/sci.ts`, `.gitlab/ci/loop.yml`) from the last 7 days, plus the GPU seconds fal reported for every clip merchants generated (Firestore, read as `gitlab-analytics`), and publishes `sci-report.md` as a job artifact. The latest report is at [`/-/jobs/artifacts/main/raw/sci-report.md?job=sci`](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/jobs/artifacts/main/raw/sci-report.md?job=sci). It's also a GitLab metrics report (`sci_gco2e_per_run`), so a merge request shows how the number moves.

## Baseline (2026-10-22)

**8.73 gCO2e per run**, down from 14.27 with two 15-second clips. Inputs measured over the 7 days to 2026-10-22: 154.7 s of billable instance time for 58 requests (Cloud Monitoring) and 522 CI minutes over 65 main pipelines (GitLab API). No merchant clip has recorded GPU seconds yet, so the video line uses the fallback estimate.

| Component | gCO2e per run | Basis |
| --- | --- | --- |
| Server (App Hosting, us-central1) | 0.06 | Measured 2.67 s of instance time per request × 40 requests per run (estimated from the playbooks) |
| CI (hosted runners, us-east1) | 2.87 | Measured 522 CI minutes a week ÷ 20 runs a week (assumed volume) |
| Model calls (Nebius) | 0.26 | 2 Nemotron calls × 0.3 Wh (Epoch AI's 2025 per-query estimate; unverified) |
| Video generation (fal) | 5.54 | 1 clip × one H100-minute at 700 W (fallback estimate until clips are recorded) |

Energy coefficients: Cloud Carbon Footprint's Google Cloud figures (0.71–4.26 W per vCPU, taken at the midpoint; 0.392 W per GB; PUE 1.1), all estimates. Video generation is still the biggest line and the least certain. It's paid per clip, off by default in autopilot, and the merchant approves it in the ad widget.

### What's measured and what's estimated for video

| Number | Status | Source |
| --- | --- | --- |
| GPU seconds per clip | **Measured** once recorded | fal's own figure for each job: `timings.inference` in the job result (H3 routes: DiT denoising on the GPU) or the queue's `metrics.inference_time`. `collect_ad_media` stores it on the job in `ad-media/{designId}`; the `sci` job uses the median over all recorded clips |
| GPU type and power | Estimate | fal names no GPU in results, request history or billing, so each GPU second is taken at an H100's 700 W TDP with PUE 1.1 |
| Fallback | Estimate | One H100-minute per clip when no clip has recorded GPU seconds |
| Grid intensity for fal | Estimate | us-central1's 432 g/kWh; fal doesn't say where a job ran |

For scale: fal's request history for the two 15-second H3 Max Reference clips of Oct 19 shows 16.4 GPU seconds of inference (`timings.inference`) and about 19 s of runner time per clip. At 16.4 s the video line would be 1.5 g and the run 4.7 g, so the fallback likely overstates video. The 5-second H3 Max Turbo clip should take less, but it hasn't been measured yet. Reframing runs ffmpeg on fal (`fal-ai/workflow-utilities/scale-video`, billed per compute second) and MMAudio adds a short audio pass; neither is in the video line.

### Choosing the video model (2026-10-22)

fal's `recommend_model` and `search_models` for a 5-second image-to-video clip, priced with `get_pricing`. Latency is fal's p50 and p90 of successful runs for Oct 12–19, excluding queue time.

| Model | Price for 5 s | Latency | Quality notes (fal's model pages) |
| --- | --- | --- | --- |
| **MiniMax H3 Max Turbo** (`minimax/h3-max-turbo/image-to-video`), chosen | $0.08 ($0.01625 per second) | Not yet published | fal's post-trained H3 Max, "co-optimized with our custom inference stack for higher throughput with no compromises on output quality"; the same family as the previous default, up to 1080P |
| LTX-Video 13B distilled (`fal-ai/ltx-video-13b-distilled/image-to-video`) | $0.04 per unit | p50 20 s, p90 27 s | Fastest, but older 0.9.7 weights and 720p at most |
| Wan 2.2 Turbo (`fal-ai/wan/v2.2-a14b/image-to-video/turbo`) | $0.10 per clip | p50 93 s, p90 327 s | 720p at most, slow and spiky |

Seedance lite and Kling 2.1 standard aren't in fal's catalog any more. H3 Max Turbo takes no artwork reference, so the clip starts from the concept's 9:16 ad image, which Nano Banana Pro made with the artwork as a reference. H3 Max Reference stays in Settings for clips without a start image.

## What we did to keep it low

| Choice | Effect | How we know |
| --- | --- | --- |
| **One short clip, cropped to every ratio** (`video_plan`, `reframe_videos`) | One 5-second H3 Max Turbo clip per ad, cropped to 1:1, 4:5 and 9:16, instead of two 15-second H3 Max Reference clips: **5.5 gCO2e per run avoided** at the fallback estimate, and about $0.18 instead of $1.53 at fal's list prices | Clip count and length by construction; prices from fal `get_pricing` (Oct 22, 2026); energy per clip is the estimate above until clips are measured |
| **Scale to zero** (`minInstances: 0` in `apphosting.yaml`) | About **334 gCO2e a week avoided** against one always-on instance, or 16.7 g per run at 20 runs a week. That's more than a whole run emits. | Measured 154.7 billable seconds in a week, against 604,800 for an always-on instance; same coefficients |
| **Scanners off on scheduled pipelines** (loop and weekly) | 169 scheduled pipelines a week skip SAST, Secret Detection and Dependency Scanning (93 s per pipeline): about **262 CI minutes and 29 gCO2e a week** avoided | Measured scanner durations on a main pipeline; main's own pipelines still scan every change |
| **Only the ops package in ops jobs** (`.ops-job` installs `--filter @wovain/ops`) | The hourly job skips the server, widgets and Firebase CLI installs | Estimate until the first scheduled runs are measured |
| **Filtered Duo triggers** | Flows run only on a person's action or a red `main`: no reviews for Renovate MRs or drafts, no Fix CI/CD on work-in-progress branches | Measured 42.9 credits for 14 flow runs on Oct 21–22 (about 3 credits a run) before the filters |
| **Deterministic code before models** | The scout, verify, shepherd and market scout make no model calls; the market intent and the funnel are assembled from data. `judge_design` decides print size, transparency, title length and colors in code | By construction (`apps/ops`, `apps/server/src/lib/design-judge.ts`) |
| **Checks before credits** | The shepherd checks paths, size and provenance before it asks Duo for a review, and asks once per commit; a failing check hands the MR to a person without spending a review | By construction (`apps/ops/src/shepherd.ts`) |

What it costs to run the loop itself: each hourly job is a short CI run on a hosted runner and shows up in the CI line above, because scheduled pipelines on `main` are counted.

## Limits

- The per-run request count (40) and weekly volume (20 runs) are estimates until real merchants use wovain; the job recomputes everything else each week.
- Model energy per call is an unverified third-party estimate. Video GPU seconds are measured once clips are recorded; the GPU's power and location are estimates.
- Duo flow energy isn't included: GitLab publishes no per-session energy figure.
