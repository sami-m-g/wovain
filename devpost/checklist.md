---
doc: checklist
status: approved
---

# Build Checklist

Build mode: learn

## Slices

- [x] **1. The wovain plugin loads in the ChatGPT desktop app and its Settings card saves**
  Becomes usable: Installing `plugin/` in the ChatGPT desktop app starts the wovain server; asking for "wovain settings" shows the Settings card; Save writes `wovain.json` and the next card reads the new value. The plugin's `mcp.json` also brings in Fourthwall, Meta Ads and fal.
  Why now: Spec check #1 is the riskiest assumption in the whole plan (desktop-only personal install, stdio server, a card rendering, a card's message triggering an auto-approved Fourthwall tool). If it fails, every later slice moves to HTTP mode + ngrok, so we find out first. Settings is the smallest real card and every later card reads it. Bootstrapping lives here.
  PRD ref: `prd.md > Screens and Layout` (Settings card), `prd.md > Look and Feel`
  Spec ref: `spec.md > Stack`, `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Components` (Plugin package, wovain server, Settings), `spec.md > Development Tooling` (Ultracite, TypeScript and Lefthook setup), `spec.md > Data Model`, `spec.md > File Structure`, `spec.md > Decisions and Open Issues` (checks #1, #7, #8)
  Build: Bun workspaces (`apps/server`, `apps/cards`, `packages/shared`, `packages/mocks`); Ultracite init per the spec command, TS 6/7 dual setup, Lefthook with gitleaks and commitlint; `.env.example` and zod `env.ts`; `store.ts` with the full settings schema and defaults; stdio MCP server with `get_settings`, `update_settings`, `show_settings_card` and the `ui://` card resource; Vite single-file build for the Settings card on `@openai/apps-sdk-ui` with the indigo accent; `plugin/plugin.json`, `plugin/mcp.json` and a `wovain-settings` hook in an existing skill or a placeholder skill so ChatGPT knows when to show it; HTTP mode behind a flag.
  Verify (mechanical): `bun run check`, `bun run typecheck` (confirms `tsc` 7.0 via the alias) and `bun test` (store round-trip, settings defaults) pass; `bun run build` emits a single HTML card; a stdio smoke script lists the tools and the `ui://` resource and round-trips `update_settings` → `get_settings`; a test commit runs Lefthook (fix, typecheck, gitleaks, commitlint).
  Learner check: Install `plugin/` as a desktop-only plugin in the ChatGPT desktop app, ask "show my wovain settings", change the daily budget to $20 and Save, then ask again and see $20. Also ask ChatGPT to "show my Fourthwall shop" and confirm it runs without an approval prompt.
  Commit: `feat(server): add plugin skeleton, settings store and settings card`

- [ ] **2. Your own idea becomes a live Fourthwall product from one approved design card**
  Becomes usable: Say "design a tee for: Japanese cat sunset"; ChatGPT generates the art, wovain cleans and uploads it, Fourthwall picks a blank and renders mockups, and a design card shows mockup, colors, placement, file quality, sizes, title, description and price with profit and margin. Approve publishes it and the card shows Live with a shop link; Skip drops it; feedback regenerates the card.
  Why now: This is the unique kernel: a design built on Fourthwall's real blanks, placements, sizes and prices, ending in a card you approve. It also carries spec check #2 (`openai/fileParams` delivers ChatGPT's image) and the economics every later card and rule depends on.
  PRD ref: `prd.md > The Core Journey` (steps 1 own-idea path, 4, 5), `prd.md > Design cards`, `prd.md > Pricing and economics`, `prd.md > States and Boundaries` (#4, #5, #6)
  Spec ref: `spec.md > Components` (Skills: `wovain-design`; wovain server: `stage_artwork`, `put_artwork`, `price_product`, `record_design`, `show_design_card`; Cards), `spec.md > External Services and Dependencies` (Fourthwall MCP, fal MCP), `spec.md > Important Failure Modes`, `spec.md > Data Model`
  Build: `lib/economics.ts` (pricing rule, breakeven per sale, priciest-size and size-weighted basis); the four tools plus `show_design_card`; `wovain-design` skill with the Fourthwall preamble; design card with Approve/Skip disabled while running, feedback field, red print quality and disabled Approve (#4), crossed-out sizes (#5), kept edits and reason on reject with designer link after 2 failures (#6); shared `QuickSettings` ⚙ menu; MSW handlers in `packages/mocks` and Storybook with a mocked `window.openai` bridge (spec check #9), one story per design-card state.
  Verify (mechanical): `bun test` reproduces the PRD demo tee table exactly ($30 → $10.32 breakeven, 2.9×) and the three-case table; tool schema tests pass; `bun run test:stories` passes for every design-card state; in ChatGPT, one real product is published and `ecommerce_get-offers` confirms it is public with the card's price.
  Learner check: In the desktop app, ask for a tee from your own idea, look over the design card (mockup, sizes, numbers), give one piece of feedback and see the card come back changed, then Approve and open the shop link.
  Commit: `feat(design): add design card and publish to fourthwall on approve`

- [ ] **3. Each published product gets an ad card with two videos, a static image, copy and its breakeven**
  Becomes usable: Right after a product goes live, an ad card shows two 15-second 9:16 UGC-style videos with captions, brand in the first 3 seconds and background audio, the mockup as a static, headline and primary text, the breakeven line and that product's rule thresholds. Each video plays full screen; Add to campaign and Skip record the choice; feedback regenerates the card.
  Why now: Video is the second-riskiest dependency (spec check #3: Kling elements must keep the print readable) and the campaign can't launch without ads. It reuses the economics from slice 2.
  PRD ref: `prd.md > The Core Journey` (steps 6, 7), `prd.md > Ad cards`, `prd.md > Pricing and economics`, `prd.md > States and Boundaries` (#7)
  Spec ref: `spec.md > Components` (Skills: `wovain-ads`; wovain server: `video_plan`, `finish_video`, `record_ad`, `show_ad_card`; Cards), `spec.md > External Services and Dependencies` (fal MCP), `spec.md > Look and Feel` (videos), `spec.md > Decisions and Open Issues` (check #3)
  Build: `video_plan` from Settings; `lib/ffmpeg.ts` with `ffmpeg-static` for captions and brand overlay; `finish_video` uploading to fal storage; `record_ad`; `lib/rules.ts` thresholds shown on the card; `wovain-ads` skill; ad card with tap-to-play muted videos, ⛶ via `requestDisplayMode`, failed-slot Retry or image-only (#7), Add to campaign disabled while running; stories per state.
  Verify (mechanical): Run one real Kling v3 Standard + MMAudio job through the fal MCP from Claude Code on a slice-2 mockup and confirm the clip and audio return; `finish_video` test on a fixture clip outputs a 9:16 file with burned-in text (checked with `ffprobe` and a frame grab); `bun test` checks rule thresholds ($30.96 kill, $8.26 scale for the demo tee); stories pass.
  Learner check: Open the ad card for the product from slice 2, play both videos full screen and judge whether the print still reads, check the margin line matches what you expect, then Add to campaign.
  Commit: `feat(ads): add ad card with kling videos, captions and breakeven`

- [ ] **4. Approved ads launch one Advantage+ sales campaign with the five rules**
  Becomes usable: After the last ad card is added or skipped, wovain checks the payment method and pixel, builds one Advantage+ sales campaign at $15 per product per day with every added ad (each link tagged `utm_content` = ad ID), creates the five rules through the Graph API, activates it, and the campaign card shows Live with an Ads Manager link, or Ready, blocked with the fix.
  Why now: This is the last step of the demo script and the proof. It depends on ads from slice 3 and carries spec checks #4 and #5 (fal.media URL upload, rule creation and filters, `ADVANTAGE_PLUS_SALES` state).
  PRD ref: `prd.md > The Core Journey` (steps 8, 9), `prd.md > Campaign launch`, `prd.md > Campaign rules`, `prd.md > States and Boundaries` (#8, #9)
  Spec ref: `spec.md > Components` (Skills: `wovain-campaign`; wovain server: `create_rules`, `show_campaign_card`), `spec.md > External Services and Dependencies` (Meta Ads MCP, Meta Graph API), `spec.md > Decisions and Open Issues` (checks #4, #5; AI disclosure and v26.0 flagged for review)
  Build: `lib/meta-graph.ts` (v26.0, system user token); `create_rules` for the five rules with per-product filters; `wovain-campaign` skill (payment and pixel checks, campaign, ad set, video uploads by URL, creatives with AI disclosure, ads, rules, activate); campaign card with Live and Ready, blocked states; stories.
  Verify (mechanical): `bun test` checks the five rule payloads against the PRD table; against the real ad account, create one NOTIFICATION rule and read it back; build the campaign and confirm via `ads_get_ad_entities` that it is `ADVANTAGE_PLUS_SALES`, holds the added ads with `utm_content` links, and that all five rules exist. Activation spends money, so it runs only after you say go, and the campaign can be paused right after if you want.
  Learner check: Finish the last ad card, see the campaign card, then open Ads Manager and find the campaign, its ads and the five rules.
  Commit: `feat(campaign): launch advantage+ campaign with automated rules`

- [ ] **5. "Make trending designs" starts the whole journey from a trend card**
  Becomes usable: Asking for trending designs shows a trend card with 5 ideas, each with growth, seasonality, Meta ad count, Etsy count, price range, example listings and a trademark flag, every number linked. Ticking 2 or 3 enables "Design the ones I picked", which hands off to slice 2's design flow.
  Why now: It completes the demo script's first two steps. It comes after the kernel because the own-idea path already proves the loop, and its risks (spec check #6: Marker alive, Etsy approval) have a labeled fallback.
  PRD ref: `prd.md > The Core Journey` (steps 1–3), `prd.md > Trend research`, `prd.md > States and Boundaries` (#1, #2, #3)
  Spec ref: `spec.md > Components` (Skills: `wovain-trends`; wovain server: `trends_evidence`, `show_trend_card`), `spec.md > External Services and Dependencies` (SerpApi, Etsy, Marker, Meta ad library), `spec.md > Important Failure Modes` (Etsy key)
  Build: `lib/serpapi.ts`, `lib/etsy.ts` (search-link fallback while unapproved), `lib/marker.ts` (class 025); `trends_evidence`; `wovain-trends` skill (web search, evidence, `ads_library_search` counts); trend card with progress (#1), empty state (#2), trademark flags (#3), pick 2–3 gate, `setWidgetState` for ticks; stories.
  Verify (mechanical): `bun test` with MSW fixtures for each source and the Etsy fallback; one live `trends_evidence` call returns growth and a Marker result; stories cover 0/1/2/3/4 ticks and the button state.
  Learner check: Ask "make trending designs", read the evidence on each idea and open a couple of links, tick 2 and click the button, and see design cards start.
  Commit: `feat(trends): add trend card with evidence and pick-to-design`

- [ ] **6. "How's my campaign?" shows an optimization card for each fired rule**
  Becomes usable: Checking in reads rule history and results, cross-checks Fourthwall sales by UTM, and shows one optimization card per fired rule with what happened, the numbers and a suggested fix. Apply the fix runs it through the same tools; Dismiss leaves the campaign; a sale Meta missed offers to turn the ad back on.
  Why now: It needs a live campaign from slice 4 and is the last behavior in the PRD. Real rule firings take spend, so mock data does most of the verifying.
  PRD ref: `prd.md > The Core Journey` (step 10), `prd.md > Optimization`, `prd.md > States and Boundaries` (#10)
  Spec ref: `spec.md > Components` (Skills: `wovain-optimize`; wovain server: `campaign_check`, `show_optimization_card`), `spec.md > External Services and Dependencies` (Meta Graph API, Fourthwall MCP), `spec.md > Development Tooling` (claude-ads NOTICE)
  Build: `campaign_check` (rule history, insights); `wovain-optimize` skill seeded from claude-ads guidance with a NOTICE credit; optimization card with Apply the fix and Dismiss, plus the turn-back-on case; stories.
  Verify (mechanical): `bun test` with MSW fixtures for a fired kill rule, a design kill and a missed-sale case; `campaign_check` against the live campaign returns cleanly with no fired rules; stories pass.
  Learner check: Ask "how's my campaign?" on the live campaign and see the no-news reply; then in mock mode see a fired-rule card and try Apply the fix and Dismiss.
  Commit: `feat(optimize): add optimization card from rule history`

- [ ] **7. The whole demo can be rehearsed in mock mode and preflighted before recording**
  Becomes usable: `bun run mock` runs the full journey without spending; `/demo-check` reports whether the plugin, cards, shop, Meta payment method and pixel, fal credit and trend keys are ready; the repo carries CI, Dependabot, release-please, knip and the `/new-tool` skill.
  Why now: Everything it rehearses exists now, and recording the demo is next (`6-ship`). These tools only pay off once the cards and tools are in place.
  PRD ref: `prd.md > Open Questions` (payment method, shop live, pixel), `prd.md > What We're Building`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It` (Rehearsal, Demo recording), `spec.md > Development Tooling`
  Build: mock mode wiring across tools and skills (skip publish and launch); `/demo-check` and `/new-tool` project skills; `.github/workflows/ci.yml` and `release-please.yml` with SHA-pinned actions; `dependabot.yml`; `knip.json`; `.vscode/`; README with install steps.
  Verify (mechanical): `bun run knip`, `bun run test`, `bun run test:stories` pass; CI workflow passes `actionlint` locally or on a pushed branch; `bun run mock` serves every card from fixtures in a stdio smoke run; `/demo-check` runs and lists each item's state.
  Learner check: Run the whole demo script once in mock mode in the desktop app, then run `/demo-check` and read what's still missing before recording.
  Commit: `chore: add mock rehearsal, demo preflight and ci`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 2, the first real product published from a design card (shapes the ad and campaign cards)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence:
Route and stops:
Edit outcome:
Reflection:
Activity mode:

## Revisions


- The plugin ships a compiled server (`plugin/bin/wovain-server`) and its cards (`plugin/cards/`), built by `bun run plugin:build` and installed with `bun run plugin:install` into a local marketplace, instead of `mcp.json` running `bun run apps/server/src/index.ts` — ChatGPT installs a cached copy of `plugin/` and launches it without your shell's PATH or environment, so the repo path and `bun` aren't reachable; data lives in `${PLUGIN_DATA}` and keys come from the repo's `.env` via `WOVAIN_ENV_FILE`.
- `plugin/plugin.json` and `plugin/mcp.json` follow the Agent Plugins 1.0.0 schemas; remote servers rely on OAuth discovery without an `auth` block — the portable schema rejects OpenAI's `extensions.com.openai.auth` on servers.
- Storybook, story tests and knip moved into slice 1, and course skills are restored from `skills-lock.json` (`bun run skills:restore`) instead of being committed — the learner asked for all DX tooling before feature code; slice 2 keeps MSW and writes design-card stories, slice 7 drops knip and Storybook setup.
- Card choice fields use the kit's `SegmentedControl` instead of `Select` — the kit's `Select` trigger fails axe's nested-interactive rule in the story tests.
- `plugin/mcp.json` ships only the wovain server; Fourthwall, Meta Ads and fal are connected directly in the app, and slice 1's "show my Fourthwall shop" check moves to slice 2, where Fourthwall is first used — declared inside the plugin, the three remote servers failed or timed out at startup and held every turn for 30 s or more, while the same URLs answered `curl` in about a second.
- The server starts without keys when `.env` is missing — the first install crashed on the missing file and hid every wovain tool.
