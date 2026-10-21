---
doc: checklist
status: approved
---

# Build Checklist

Build mode: learn

## Slices

- [x] **1. The wovain plugin loads in the ChatGPT desktop app and its Settings widget saves**
  Becomes usable: Installing `plugin/` in the ChatGPT desktop app starts the wovain server; asking for "wovain settings" shows the Settings widget; Save writes `wovain.json` and the next widget reads the new value. The plugin's `mcp.json` also brings in Fourthwall, Meta Ads and fal.
  Why now: Spec check #1 is the riskiest assumption in the whole plan (desktop-only personal install, stdio server, a widget rendering, a widget's message triggering an auto-approved Fourthwall tool). If it fails, every later slice moves to HTTP mode + ngrok, so we find out first. Settings is the smallest real widget and every later widget reads it. Bootstrapping lives here.
  PRD ref: `prd.md > Screens and Layout` (Settings widget), `prd.md > Look and Feel`
  Spec ref: `spec.md > Stack`, `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Components` (Plugin package, wovain server, Settings), `spec.md > Development Tooling` (Ultracite, TypeScript and Lefthook setup), `spec.md > Data Model`, `spec.md > File Structure`, `spec.md > Decisions and Open Issues` (checks #1, #7, #8)
  Build: Bun workspaces (`apps/server`, `apps/widgets`, `packages/shared`, `packages/mocks`); Ultracite init per the spec command, TS 6/7 dual setup, Lefthook with gitleaks and commitlint; `.env.example` and zod `env.ts`; `store.ts` with the full settings schema and defaults; stdio MCP server with `get_settings`, `update_settings`, `show_settings_widget` and the `ui://` widget resource; Vite single-file build for the Settings widget on `@openai/apps-sdk-ui` with the indigo accent; `plugin/plugin.json`, `plugin/mcp.json` and a `wovain-settings` hook in an existing skill or a placeholder skill so ChatGPT knows when to show it; HTTP mode behind a flag.
  Verify (mechanical): `bun run check`, `bun run typecheck` (confirms `tsc` 7.0 via the alias) and `bun test` (store round-trip, settings defaults) pass; `bun run build` emits a single HTML widget; a stdio smoke script lists the tools and the `ui://` resource and round-trips `update_settings` → `get_settings`; a test commit runs Lefthook (fix, typecheck, gitleaks, commitlint).
  Learner check: Install `plugin/` as a desktop-only plugin in the ChatGPT desktop app, ask "show my wovain settings", change the daily budget to $20 and Save, then ask again and see $20. Also ask ChatGPT to "show my Fourthwall shop" and confirm it runs without an approval prompt.
  Commit: `feat(server): add plugin skeleton, settings store and settings widget`

- [x] **2. Your own idea becomes a live Fourthwall product from one approved design widget**
  Becomes usable: Say "design a tee for: Japanese cat sunset"; ChatGPT generates the art, wovain cleans and uploads it, Fourthwall picks a blank and renders mockups, and a design widget shows mockup, colors, placement, file quality, sizes, title, description and price with profit and margin. Approve publishes it and the widget shows Live with a shop link; Skip drops it; feedback regenerates the widget.
  Why now: This is the unique kernel: a design built on Fourthwall's real blanks, placements, sizes and prices, ending in a widget you approve. It also carries spec check #2 (`openai/fileParams` delivers ChatGPT's image) and the economics every later widget and rule depends on.
  PRD ref: `prd.md > The Core Journey` (steps 1 own-idea path, 4, 5), `prd.md > Design widgets`, `prd.md > Pricing and economics`, `prd.md > States and Boundaries` (#4, #5, #6)
  Spec ref: `spec.md > Components` (Skills: `wovain-design`; wovain server: `stage_artwork`, `put_artwork`, `price_product`, `record_design`, `show_design_widget`; Widgets), `spec.md > External Services and Dependencies` (Fourthwall MCP, fal MCP), `spec.md > Important Failure Modes`, `spec.md > Data Model`
  Build: `lib/economics.ts` (pricing rule, breakeven per sale, priciest-size and size-weighted basis); the four tools plus `show_design_widget`; `wovain-design` skill with the Fourthwall preamble; design widget with Approve/Skip disabled while running, feedback field, red print quality and disabled Approve (#4), crossed-out sizes (#5), kept edits and reason on reject with designer link after 2 failures (#6); shared `QuickSettings` ⚙ menu; MSW handlers in `packages/mocks` and Storybook with a mocked `window.openai` bridge (spec check #9), one story per design-widget state.
  Verify (mechanical): `bun test` reproduces the PRD demo tee table exactly ($30 → $10.32 breakeven, 2.9×) and the three-case table; tool schema tests pass; `bun run test:stories` passes for every design-widget state; in ChatGPT, one real product is published and `ecommerce_get-offers` confirms it is public with the widget's price.
  Learner check: In the desktop app, ask for a tee from your own idea, look over the design widget (mockup, sizes, numbers), give one piece of feedback and see the widget come back changed, then Approve and open the shop link.
  Commit: `feat(design): add design widget and publish to fourthwall on approve`

- [x] **3. Each published product gets an ad widget with two videos, a static image, copy and its breakeven**
  Becomes usable: Right after a product goes live, an ad widget shows two 15-second 9:16 UGC-style videos with captions, brand in the first 3 seconds and background audio, the mockup as a static, headline and primary text, the breakeven line and that product's rule thresholds. Each video plays full screen; Add to campaign and Skip record the choice; feedback regenerates the widget.
  Why now: Video is the second-riskiest dependency (spec check #3: Kling elements must keep the print readable) and the campaign can't launch without ads. It reuses the economics from slice 2.
  PRD ref: `prd.md > The Core Journey` (steps 6, 7), `prd.md > Ad widgets`, `prd.md > Pricing and economics`, `prd.md > States and Boundaries` (#7)
  Spec ref: `spec.md > Components` (Skills: `wovain-ads`; wovain server: `video_plan`, `finish_video`, `record_ad`, `show_ad_widget`; Widgets), `spec.md > External Services and Dependencies` (fal MCP), `spec.md > Look and Feel` (videos), `spec.md > Decisions and Open Issues` (check #3)
  Build: `video_plan` from Settings; `lib/ffmpeg.ts` with `ffmpeg-static` for captions and brand overlay; `finish_video` uploading to fal storage; `record_ad`; `lib/rules.ts` thresholds shown on the widget; `wovain-ads` skill; ad widget with tap-to-play muted videos, ⛶ via `requestDisplayMode`, failed-slot Retry or image-only (#7), Add to campaign disabled while running; stories per state.
  Verify (mechanical): Run one real Kling v3 Standard + MMAudio job through the fal MCP from Claude Code on a slice-2 mockup and confirm the clip and audio return; `finish_video` test on a fixture clip outputs a 9:16 file with burned-in text (checked with `ffprobe` and a frame grab); `bun test` checks rule thresholds ($30.96 kill, $8.26 scale for the demo tee); stories pass.
  Learner check: Open the ad widget for the product from slice 2, play both videos full screen and judge whether the print still reads, check the margin line matches what you expect, then Add to campaign.
  Commit: `feat(ads): add ad widget with kling videos, captions and breakeven`

- [x] **4. Approved ads launch one Advantage+ sales campaign with the five rules**
  Becomes usable: After the last ad widget is added or skipped, wovain checks the payment method and pixel, builds one Advantage+ sales campaign at $15 per product per day with every added ad (each link tagged `utm_content` = ad ID), creates the five rules through the Graph API, activates it, and the campaign widget shows Live with an Ads Manager link, or Ready, blocked with the fix.
  Why now: This is the last step of the demo script and the proof. It depends on ads from slice 3 and carries spec checks #4 and #5 (fal.media URL upload, rule creation and filters, `ADVANTAGE_PLUS_SALES` state).
  PRD ref: `prd.md > The Core Journey` (steps 8, 9), `prd.md > Campaign launch`, `prd.md > Campaign rules`, `prd.md > States and Boundaries` (#8, #9)
  Spec ref: `spec.md > Components` (Skills: `wovain-campaign`; wovain server: `create_rules`, `show_campaign_widget`), `spec.md > External Services and Dependencies` (Meta Ads MCP, Meta Graph API), `spec.md > Decisions and Open Issues` (checks #4, #5; AI disclosure and v26.0 flagged for review)
  Build: `lib/meta-graph.ts` (v26.0, system user token); `create_rules` for the five rules with per-product filters; `wovain-campaign` skill (payment and pixel checks, campaign, ad set, video uploads by URL, creatives with AI disclosure, ads, rules, activate); campaign widget with Live and Ready, blocked states; stories.
  Verify (mechanical): `bun test` checks the five rule payloads against the PRD table; against the real ad account, create one NOTIFICATION rule and read it back; build the campaign and confirm via `ads_get_ad_entities` that it is `ADVANTAGE_PLUS_SALES`, holds the added ads with `utm_content` links, and that all five rules exist. Activation spends money, so it runs only after you say go, and the campaign can be paused right after if you want.
  Learner check: Finish the last ad widget, see the campaign widget, then open Ads Manager and find the campaign, its ads and the five rules.
  Commit: `feat(campaign): launch advantage+ campaign with automated rules`

- [ ] **5. "Make trending designs" starts the whole journey from a trend widget**
  Becomes usable: Asking for trending designs shows a trend widget with 5 ideas, each with growth, seasonality, Meta ad count, Etsy count, price range, example listings and a trademark flag, every number linked. Ticking 2 or 3 enables "Design the ones I picked", which hands off to slice 2's design flow.
  Why now: It completes the demo script's first two steps. It comes after the kernel because the own-idea path already proves the loop, and its risks (spec check #6: Marker alive, Etsy approval) have a labeled fallback.
  PRD ref: `prd.md > The Core Journey` (steps 1–3), `prd.md > Trend research`, `prd.md > States and Boundaries` (#1, #2, #3)
  Spec ref: `spec.md > Components` (Playbooks: `trends`; wovain server: `trends_evidence`, `show_trend_widget`), `spec.md > External Services and Dependencies` (SerpApi, Etsy, Marker, Meta ad library), `spec.md > Important Failure Modes` (Etsy key)
  Build: `lib/serpapi.ts`, `lib/etsy.ts` (search-link fallback while unapproved), `lib/marker.ts` (class 025); `trends_evidence`; a `trends` playbook in `apps/server/src/playbooks/` (web search, evidence, `ads_library_search` counts); trend widget with progress (#1), empty state (#2), trademark flags (#3), pick 2–3 gate, `setWidgetState` for ticks; stories.
  Verify (mechanical): `bun test` with MSW fixtures for each source and the Etsy fallback; one live `trends_evidence` call returns growth and a Marker result; stories cover 0/1/2/3/4 ticks and the button state.
  Learner check: Ask "make trending designs", read the evidence on each idea and open a couple of links, tick 2 and click the button, and see design widgets start.
  Commit: `feat(trends): add trend widget with evidence and pick-to-design`

- [ ] **6. "How's my campaign?" shows an optimization widget for each fired rule**
  Becomes usable: Checking in reads rule history and results, cross-checks Fourthwall sales by UTM, and shows one optimization widget per fired rule with what happened, the numbers and a suggested fix. Apply the fix runs it through the same tools; Dismiss leaves the campaign; a sale Meta missed offers to turn the ad back on.
  Why now: It needs a live campaign from slice 4 and is the last behavior in the PRD. Real rule firings take spend, so mock data does most of the verifying.
  PRD ref: `prd.md > The Core Journey` (step 10), `prd.md > Optimization`, `prd.md > States and Boundaries` (#10)
  Spec ref: `spec.md > Components` (Playbooks: `optimize`; wovain server: `campaign_check`, `show_optimization_widget`), `spec.md > External Services and Dependencies` (Meta Graph API, Fourthwall MCP), `spec.md > Development Tooling` (claude-ads NOTICE)
  Build: `campaign_check` (rule history, insights); an `optimize` playbook seeded from claude-ads guidance with a NOTICE credit; optimization widget with Apply the fix and Dismiss, plus the turn-back-on case; stories.
  Verify (mechanical): `bun test` with MSW fixtures for a fired kill rule, a design kill and a missed-sale case; `campaign_check` against the live campaign returns cleanly with no fired rules; stories pass.
  Learner check: Ask "how's my campaign?" on the live campaign and see the no-news reply; then in mock mode see a fired-rule widget and try Apply the fix and Dismiss.
  Commit: `feat(optimize): add optimization widget from rule history`

- [ ] **7. The whole demo can be rehearsed in mock mode and preflighted before recording**
  Becomes usable: `bun run mock` runs the full journey without spending; `/demo-check` reports whether the server, widgets, shop, Meta payment method and pixel, fal credit and trend keys are ready; the repo carries the `/new-tool` skill (CI, Renovate, semantic-release and knip already shipped).
  Why now: Everything it rehearses exists now, and recording the demo is next (`6-ship`). These tools only pay off once the widgets and tools are in place.
  PRD ref: `prd.md > Open Questions` (payment method, shop live, pixel), `prd.md > What We're Building`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It` (Rehearsal, Demo recording), `spec.md > Development Tooling`
  Build: mock mode wiring across tools and playbooks (skip publish and launch); `/demo-check` and `/new-tool` project skills; `.vscode/`.
  Verify (mechanical): `bun run knip`, `bun run test`, `bun run test:stories` pass; `bun run mock` serves every widget from fixtures over `/mcp`; `/demo-check` runs and lists each item's state.
  Learner check: Run the whole demo script once in mock mode in a connected agent (ChatGPT or Claude), then run `/demo-check` and read what's still missing before recording.
  Commit: `chore: add mock rehearsal, demo preflight and ci`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after slice 2, the first real product published from a design widget (shapes the ad and campaign widgets). Learner found: artwork import, upload 403, blocked mockups, raw badge codes, slow iteration; all fixed and retried. "Japanese Cat Sunset — Woodblock-Inspired Tee" approved and PUBLIC at $32. Feedback-regenerate not yet tried live (covered by stories). fal needs credits before slice 3.
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [x] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [x] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence:
Route and stops:
Edit outcome:
Reflection:
Activity mode:

## Revisions


- The plugin ships a compiled server (`plugin/bin/wovain-server`) and its widgets (`plugin/widgets/`), built by `bun run plugin:build` and installed with `bun run plugin:install` into a local marketplace, instead of `mcp.json` running `bun run apps/server/src/index.ts` — ChatGPT installs a cached copy of `plugin/` and launches it without your shell's PATH or environment, so the repo path and `bun` aren't reachable; data lives in `${PLUGIN_DATA}` and keys come from the repo's `.env` via `WOVAIN_ENV_FILE`.
- `plugin/plugin.json` and `plugin/mcp.json` follow the Agent Plugins 1.0.0 schemas; remote servers rely on OAuth discovery without an `auth` block — the portable schema rejects OpenAI's `extensions.com.openai.auth` on servers.
- Storybook, story tests and knip moved into slice 1, and course skills are restored from `skills-lock.json` (`bun run skills:restore`) instead of being committed — the learner asked for all DX tooling before feature code; slice 2 keeps MSW and writes design-widget stories, slice 7 drops knip and Storybook setup.
- Widget choice fields use the kit's `SegmentedControl` instead of `Select` — the kit's `Select` trigger fails axe's nested-interactive rule in the story tests.
- `plugin/mcp.json` ships only the wovain server; Fourthwall, Meta Ads and fal are connected directly in the app, and slice 1's "show my Fourthwall shop" check moves to slice 2, where Fourthwall is first used — declared inside the plugin, the three remote servers failed or timed out at startup and held every turn for 30 s or more, while the same URLs answered `curl` in about a second.
- The server starts without keys when `.env` is missing — the first install crashed on the missing file and hid every wovain tool.
- `stage_artwork` takes image generation's `data:` URL and chat attachments from the temp folder, and the skill uploads to Fourthwall before fal cleans or upscales from that public URL — in desktop local threads, image generation returns a `data:` URL rather than an `openai/fileParams` file object (spec check #2), and wovain has no public storage of its own.
- `put_artwork` sends `x-goog-content-length-range: 0,<bytes>` with the content type — Fourthwall's signed upload URL includes that header in its signature; without it Google storage answered 403 twice.
- Widgets declare `cdn.fourthwall.com`, `imgproxy.fourthwall.dev` and fal's media hosts in their resource CSP, and widget URIs moved to `-v2` — the widget sandbox blocked Fourthwall's mockups until declared, and the host caches widgets by URI.
- Designs and staged artwork live in top-level `designs` and `artworks` in `wovain.json`, and the widget follows publishing through `get_design` — one merchant runs one flow at a time, so per-run grouping added nothing; MSW moves to slice 5, the first slice with outside API calls to mock.
- The minimum artwork width is 150 px per print inch (unverified Fourthwall guidance); with fal out of credits, ChatGPT chose an 8×8 in placement so the 1254 px art stays sharp (PRD state #4).
- `bun run plugin:dev` and `bun run widgets:watch` added — the learner asked for faster iteration than reinstall, restart and a new chat per change.
- Video model options add MiniMax H3 Max Turbo and H3 Max for test runs, and the Settings widget shows live fal prices (`/v1/models/pricing` with `FAL_KEY`, cached a day) with dated list prices as the fallback — fal's Kling v3 Standard price rose from the planned $1.26 to $2.10 per 15 s clip, and the learner wanted cheaper options while testing.
- Slice 3 shipped with H3 Max Reference (not Kling v3 Standard): it kept the print on-model in a live run. fal billed about $0.08/s against a $0.05/s list price, so cost lines now say "list price, actual may be higher" and an optional `FAL_BILLING_KEY` lets `video_spend` report the real charge. The widget's CSP needed `v3b.fal.media` for finished clips. Brand overlay is off by default (Meta already shows the Page name and picture); captions sit at 60% height. Caption styling and editable video scenes are left for later; the scene prompts stay locked to protect the print.
- After the hackathon move to GitLab, the caption and brand burn-in (`finish_video`, `lib/ffmpeg.ts`, `ffmpeg-static`, the bundled font and the Overlay settings) was removed: ffmpeg-static's Linux build has no `drawtext` filter, so it failed in CI and on Vercel. Ads now use fal's clip URLs as they come back; Meta shows the Page name on every ad and the primary text carries the message.
- Slices 5 (trend widget) and 6 (optimization widget) moved to later, by the learner's call, to finish the campaign launch and `6-ship` within the time left. The own-idea path (slice 2) stays the journey's entry point for the demo.
- Slice 4: Meta's rules engine judges one ad, ad set or campaign at a time, so "Kill, design" runs on the campaign when it holds one product; with several products it waits for the check-in (slice 6, now later). The ad account has no Business Manager, so `META_SYSTEM_USER_TOKEN` holds a long-lived user token with `ads_management`; the five rules were created and read back live. The Meta connector builds a draft: nothing spends until the merchant presses Launch, which publishes it. Live findings folded into `wovain-campaign`: fall back to the merchant's own Pages when none is linked to the ad account, `hide_ui` on create calls, a thumbnail by `image_hash` only, and no `headline` on video creatives (the connector maps it to a retired CTA field). Skill edits need `bun run plugin:dev` and a new chat.
- Slice 7 (mock mode, `/demo-check`, `/new-tool`) moved to later by the learner's call: every journey step has already run for real, so the demo is recorded from those chats and Ads Manager. Its CI, Dependabot, release-please and knip parts already shipped during slice 1 and the repo setup.
- Wrap-up was a brief evidence-based recap, not a guided tour, by the learner's time-boxed finish: the "Add to campaign" route in `devpost/app-map.html` (snapshot of c744d79, every path and anchor checked against the code) and the practice of keeping money math in server code pinned by a test. The optional edit and reflection weren't offered, to keep within the hour.
- 2026-10-21: wovain is now one MCP server that any agent connects to remotely with OAuth, and the ChatGPT plugin is gone. `plugin/`, `bun run plugin:install`, `bun run plugin:dev` and the plugin zip in CI and releases were removed, so the learner checks above that install the plugin in the ChatGPT desktop app describe how those slices were verified at the time. To try it now, add `https://wovain.vercel.app/mcp` (or `https://<tunnel>/mcp` for `bun run dev`) as a remote MCP server in ChatGPT developer mode or Claude, sign in with Google and approve access. The `wovain-design`, `wovain-ads` and `wovain-campaign` skills became playbooks in `apps/server/src/playbooks/`. The server sends them as its MCP `instructions` and serves each one through `get_playbook({ step })` and as the MCP prompts `design`, `ads` and `campaign`, so a playbook edit ships with the next deploy and needs no reinstall. `apps/web` (Next.js) and `packages/db` merged into the Hono package `apps/server`, which runs on Vercel's Bun runtime: `src/index.ts` is the entry, `src/app.ts` holds the routes (`/mcp`, `/api/auth/*`, `/.well-known/*`, `/`, `/sign-in`, `/consent`), the sign-in and consent pages are server-rendered forms behind a CSRF check, and the Drizzle schema and migrations live in `src/db/` and `migrations/`. `apps/server/vercel.json` pre-bundles the server with `bun build` into `dist/` and ships the built widgets from `apps/widgets/dist`. Planning docs are Markdown only: the `.html` companions, the `sync-plan` skill and `scripts/plan-sync.ts` were removed, and `devpost/app-map.html` now maps the `apps/server` layout.
