# Intent: Autopilot, one command from idea to a paused Meta campaign

Issue: #22

## Problem

> Design (plan only, then STOP for approval) an "autopilot" mode for wovain: one command or parameter runs the whole journey end to end with NO human approval or feedback: research (Qloo and Tavily) → design (art generation) → judge → publish to Fourthwall → ad creative → Meta campaign created **PAUSED**. Wherever the merchant normally approves a widget, an AI agent on **NVIDIA Nemotron through Nebius Token Factory** decides instead. This is a hackathon requirement.

> The owner's goal for autopilot is "products that sell."

Every step of today's journey waits for the merchant on a widget: Approve on the design, Add to campaign on the ad, Launch on the campaign (`prd.md > The Core Journey`). A merchant who wants wovain to research, make and stage products while they're away has to click through each widget. The hackathon also needs Nemotron on Nebius to make the decisions, and today Nemotron only advises (`judge_design`, `research_trends`).

## Desired outcome

- One tool call, `autopilot`, takes an idea or a niche, a daily ad budget and a cost cap, and runs on the server with nobody watching. It ends with:
  - 1 to 3 products on Fourthwall, hidden by default;
  - their ad creative (two videos, the mockup, copy);
  - one Meta Advantage+ sales campaign holding those ads, created **paused**.
- Each approval point in the PRD becomes a Nemotron decision with a zod schema. Code holds the hard limits, and the model can't cross them:
  - the price is at or above the breakeven rule's minimum;
  - the daily budget is at or under the merchant's cap;
  - the trademark screen passes;
  - the judge's verdict is "ready" within at most N revisions.
- Decisions aim at **products that sell**. Each idea is scored on:
  - demand: who loves what, from Qloo;
  - momentum: why now, from Tavily news;
  - saturation: marketplace competitors on Etsy, Redbubble and Amazon from Tavily, plus active Meta ads on the theme from the Ad Library;
  - IP safety;
  - margin: room at or above the minimum.
- Qloo answers "who and what they love" (the audience, art direction and targeting notes). Tavily answers "why now" (the hook and the ad copy).
- Every decision is stored with its inputs, its choice and its reasoning, so the merchant can review the run afterwards. A run-status widget shows the steps, the decisions, the money spent and a Stop button.
- A run can be stopped, resumed and re-run without making a second product or campaign.
- **Later phase:** a learning loop. Once the merchant launches the paused campaign, wovain reads Fourthwall sales by UTM and Meta results, kills or scales designs (#5), and recalibrates the idea-scoring weights.

## Constraints

- **Money.** Autopilot never activates a campaign or spends ad budget. Meta objects are created paused (the Meta Ads MCP creates campaigns and ads in PAUSED or draft state) and autopilot has no code path to `ads_activate_entity`. Generation spend (fal) stops at a per-run cost cap.
- **Merchant accounts.** Fourthwall, fal and Meta calls go through the merchant's own OAuth grants from #19 (`lib/connections.ts`, `lib/upstream.ts`, built in another branch). Autopilot only consumes them. Meta connects for Meta app testers only until App Review (#19 chunks 6 to 8).
- **Platform services.** Nebius, Tavily and Qloo stay operator-paid, under #19's per-user quotas.
- **Overlaps.** Server-side art generation with a judge and a copyright check is #4; autopilot builds on it rather than adding a second generator. The learning loop and kill or scale rules connect to #5.
- **PRD changes.** Autopilot contradicts four current PRD statements: "Nothing is published or spends money without the merchant's approval on a widget", "Trend research" as a non-goal, "Draft or hidden products" as a non-goal, and "The campaign launches live; there is no paused option". The build MR updates `prd.md`, `spec.md`, `scope.md` and `app-map.html` so the widget journey and autopilot sit side by side.
- No migrations: new records are zod-checked on read. Third-party text (Tavily, Qloo, Meta Ad Library, Fourthwall) stays data and is never followed as an instruction.
- App Hosting (Cloud Run underneath, 0 to 2 instances, CPU only during requests) must run a job that takes minutes.

## Open questions

1. **Publish live or hidden?** Recommended default: `hidden`. Fourthwall creates offers HIDDEN and autopilot just doesn't make them PUBLIC, so this is the safest state Fourthwall supports. Note that a hidden product's page isn't open to shoppers, so the merchant must make it public before turning the campaign on. The run summary and widget say so. Is `live` allowed as an opt-in?
2. **N revisions.** Recommended: 2 revisions (3 images at most per idea) and at most 3 ideas tried per product slot. Fine?
3. **Default cost cap.** Recommended: `maxSpend` $5 per run (about 2.5 products' worth of generation at today's prices). Fine?
4. **AI label on Meta creatives.** In the widget journey the merchant answers this once. Autopilot needs a stored setting. Recommended default: `OPT_IN` (label as made with AI), since nobody reviews the creative. Fine?
5. **Videos by default?** Videos are about 85% of a run's cost. Recommended: on by default, with `videos: false` for a static-only run.
6. **Meta before App Review.** Until the merchant has a wovain Meta grant, should a run stop at "ads ready, connect Meta" (recommended), or hand the campaign build to the host agent's own Meta MCP?
7. **Trademark hits.** Recommended: any hit on the exact phrase fails the idea, and Nemotron can't clear it. Too strict?
8. **Who may run autopilot?** It spends on the merchant's fal account with no click. Recommended: a per-user setting `autopilot.enabled` (off by default) that the merchant turns on once in the Settings widget, plus an operator kill switch.
