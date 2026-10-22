---
name: demo
description: Render wovain's narrated demo video (under 3 minutes) from a fresh end-to-end journey run. Use when the user says "/demo", asks for a demo video, or needs the video for a Transcend or Nebius submission.
argument-hint: "[--reuse to skip the e2e run]"
metadata:
  slash-command: enabled
---

# Render the demo video

The video comes from the end-to-end journey test, so every capability the test covers is in it, in order, with no waiting. Don't write a separate script: each step's caption and narration is the `say` line in `apps/server/test/e2e/journey.test.ts`. To add a capability to the demo, add its step there.

## 1. Run the journey

- Java 21 must be on the PATH (Firestore emulator).
- `pnpm test:e2e` builds the widgets, runs the journey on the emulators with recorded Fourthwall, fal, Meta, Tavily, Qloo and Nebius replies, and writes `e2e-report/` (`journey.json`, `index.html`, `shots/`).
- With `--reuse`, skip this step if `e2e-report/journey.json` exists.
- If a step fails, stop and report it: the demo only shows a journey that passed.

## 2. Render

- `pnpm demo` writes `e2e-report/demo.mp4`: one scene per step, captions drawn in HTML beside the step's widget screenshot, crossfades, narration timed to each line.
- Narration: with `FAL_KEY` in the environment it uses fal's Kokoro voice (`fal-ai/kokoro/american-english`, a few cents a run, on the operator's own key, for dev tooling only). Pipe the key in without printing it, for example `FAL_KEY="$(pulumi config get fal-key --cwd infra -s prod)" pnpm demo`. Without it, espeak-ng if installed, else captions only.
- It fails if the video would run 175 seconds or more (the Transcend and Nebius limit is 3 minutes). Shorten the longest `say` lines rather than dropping steps.

## 3. Check and hand over

- Look at a few frames: `apps/widgets/node_modules/ffmpeg-static/ffmpeg -ss 20 -i e2e-report/demo.mp4 -frames:v 1 /tmp/frame.png`, then read the PNG.
- Report the path, the length and the narration source. CI renders the same video on every merge request and on main (job `demo`, artifact `e2e-report/demo.mp4`), and main publishes the report and the video to GitLab Pages.
