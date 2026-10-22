# Spec: Autopilot, one command from idea to a paused Meta campaign

Intent: [intent.md](intent.md)

## Requirements

1. `autopilot` starts a run and returns at once with a `runId` and the run-status widget. The run goes on with no host agent and no merchant: research → idea choice → art → judge → listing and price → trademark screen → Fourthwall product → ad creative → Meta campaign (paused) → summary.
2. Each approval point in `prd.md` is a Nemotron decision (`nebius/nvidia/nemotron-3-super-120b-a12b` through Genkit, `lib/ai.ts`). Its reply is zod-checked, and code applies the hard limits after it:
   - **Price** ≥ `price_product`'s minimum for the blank, which already holds breakeven with at least $10 profit or a 30% margin.
   - **Daily budget** ≤ the `budgetDaily` argument ≤ `settings.campaign.dailyBudgetPerProduct` × products, and never over the settings schema's $500 maximum.
   - **Trademark screen** returns no hits for the title's key phrase and for any words in the art. A hit fails the idea.
   - **Judge** verdict is `ready` after at most `maxRevisions` (default 2) revisions. Otherwise the idea is dropped.
   - **Run cost** (fal spend plus estimates for the step about to run) ≤ `maxSpend`. A step that would cross it doesn't start.
3. Every Meta object is created paused. Autopilot has no call to `ads_activate_entity` or `ads_update_entity` with an active status. The upstream allowlist for autopilot is a fixed list in code (below), and the tests assert that activation tools aren't on it.
4. Products are created HIDDEN (Fourthwall's default for `create-offers-from-designs`). They're made PUBLIC only when the run was started with `publish: "live"` and every limit passed.
5. Every decision is stored as an event under the run: the step, its inputs (summarized), the options, the choice, Nemotron's reasoning, which limits applied and whether code overrode the model. `autopilot_status` returns them.
6. Runs are idempotent:
   - the same `runKey` returns the existing run;
   - each step saves the upstream IDs it created before the run moves on, and a retried step reads them before creating anything.
7. Kill switches:
   - `autopilot_stop` stops a run before its next step;
   - a per-user `autopilot.enabled` setting, off by default;
   - an operator switch, `WOVAIN_AUTOPILOT`, set in `infra/` and `apphosting.yaml`;
   - one active run per user.
8. Without a Nebius key or the operator switch, `autopilot` answers `configured: false`. Without a needed connection, the run pauses in `needs_connection` with the connect link, and `autopilot_resume` goes on once the merchant has connected.

## Design

### 1. Where it runs: a server-side Genkit flow, stepped by Cloud Tasks

**Recommendation:** a wovain tool that starts a server-side Genkit flow. A playbook with the approvals skipped is the wrong tool for this job:

- the hackathon needs Nemotron, not the host model, to decide;
- ChatGPT stops a turn after a few minutes, so a long run depends on the host staying in the loop;
- a host model could quietly skip a hard limit written in prose.

The run doesn't fit in one request:

- App Hosting runs on Cloud Run with `cpuAlwaysAllocated: false` (the default), so CPU is throttled once a response is sent. Background work after the tool returns isn't safe.
- `runConfig` has no request-timeout field: the documented fields are `cpu`, `memoryMiB`, `minInstances`, `maxInstances`, `concurrency`, `cpuAlwaysAllocated` and `vpcAccess` ([configure](https://firebase.google.com/docs/app-hosting/configure)). So the timeout is whatever App Hosting sets on the Cloud Run service. That value isn't documented (unverified; Cloud Run's own default is 300 s).
- A run makes images (about 30 to 90 s each), mockups, Fourthwall offers (`create-offers-from-designs` waits up to 1 minute per design) and two videos (minutes). It can take 10 to 20 minutes.

So the run is a **state machine in Firestore, stepped by Cloud Tasks**:

- `autopilot` writes the run document and enqueues the first task.
- A task is an HTTP POST to `/tasks/autopilot` on the same App Hosting backend, with `{ userId, runId }` and an OIDC token.
- The handler takes a lease on the run in a transaction, then runs the Genkit flow `autopilotStep`. The flow runs pending steps until about 45 s have passed, saves each step's output, and enqueues the next task before it returns.
- Slow upstream work is split into **submit** and **poll** steps. fal jobs go through `submit_job`, then `check_job` from a task scheduled 15 to 30 s later. No request ever waits on a model for minutes, whatever the real timeout is.
- Cloud Tasks retries a failed task with backoff (queue config: 5 attempts). Then the run goes to `failed` at that step, and `autopilot_resume` can retry it.

Alternatives considered:

| Option | Why not |
| --- | --- |
| One long request (or `waitUntil`-style background work) | CPU is throttled after the response, the timeout is undocumented, and an instance restart loses the run |
| Genkit durable streaming (`FirestoreStreamManager`, beta) | It replays a stream to a client that reconnects. It doesn't resume a flow after a crash, and Firestore's 1 MB document limit caps the stream ([docs](https://genkit.dev/docs/js/durable-streaming)) |
| Cloud Run jobs | A separate container image and deploy. App Hosting builds only the service. Cloud Tasks calls the code that's already deployed |
| The host agent polls `autopilot_status` to advance the run | Breaks "one command": the run stops when the chat closes. It's kept only as a nudge: status re-enqueues a run whose lease is stale |

Genkit use:

- `ai.defineFlow({ name: "autopilotStep", inputSchema, outputSchema })` holds the step loop.
- Each step runs inside `ai.run("<step>", fn)`, so traces name the steps. Genkit spans are dropped by wovain's tracer today (#20), so tracing stays local to the Genkit dev UI.
- Decisions use the existing `generateObject` (JSON mode with a zod 4 schema).

Infrastructure, in `infra/`:

- `gcp.cloudtasks.Queue` named `autopilot` in `us-central1`: max 5 attempts, min backoff 10 s, max 2 concurrent dispatches per queue to match `maxInstances: 2`.
- A service account `autopilot-tasks` used for the OIDC token, with `roles/iam.serviceAccountUser` on it for the App Hosting service account (needed to mint the token), and `roles/cloudtasks.enqueuer` for the App Hosting service account.
- `WOVAIN_AUTOPILOT` (operator switch) and `WOVAIN_TASKS_QUEUE` in `apphosting.yaml`.
- The handler checks the OIDC token with `google-auth-library` `OAuth2Client.verifyIdToken`: audience is `<site>/tasks/autopilot`, email is the task service account. `google-auth-library` already comes in with `firebase-admin`; add it as a direct dependency. Enqueue with `@google-cloud/tasks`.
- Local development uses an in-process queue behind the same two-function interface (`enqueue`, `verify`), so `pnpm dev` and Vitest need no Cloud Tasks emulator.

### 2. The decision agents: fixed steps, structured decisions

**Recommendation:** fixed steps in code, with one structured Nemotron call per decision. No agent loop.

- Token Factory accepts OpenAI-format `tools` with `tool_choice` `auto` or a named function ([function calling](https://docs.tokenfactory.nebius.com/ai-models-inference/function-calling)). Nebius describes Nemotron 3 Super as built for tool calling ([launch post](https://nebius.com/blog/posts/nemotron3-super-now-available)), but Nebius's docs don't name the model as tool-capable, and no `tools` request has run against it yet (unverified: no local key).
- Structured JSON output already works: `judge_design` and `research_trends` run on it in production.
- Fixed steps keep the order of spending actions in code. The model chooses among options code gives it, never which upstream tool to call. Each decision is a small unit test with a stubbed model. A loop would need its own guardrails for every tool and costs more tokens per run.
- Revisit only if a later feature needs open-ended exploration. The #19 design comment already describes how: Genkit `defineTool` wrappers over wovain's connection client, with the same allowlist.

The decisions, in order. Each has a zod reply schema in `packages/shared/src/autopilot.ts`, and code applies the limits listed after the model answers.

| # | Decision (replaces) | Model sees | Model returns | Code enforces after |
| --- | --- | --- | --- | --- |
| D1 | **Pick ideas** (the merchant picking from `research_trends`) | Candidate ideas, each with Qloo affinities, Tavily news, marketplace competition and Ad Library counts | Per idea, 0 to 10 scores for `demand`, `momentum`, `saturation` (higher is less crowded), `ipSafety` and `marginRoom`, with one-line reasons; a recommended order | Score = weighted sum with weights from settings (`autopilot.weights`, defaults 0.3 demand, 0.25 momentum, 0.2 saturation, 0.15 IP, 0.1 margin). Ideas naming a brand, person, character or lyric are removed before scoring (code list plus the model's `ipSafety` < 5). The top `count` go on; the rest wait as fallbacks |
| D2 | **Art brief** (the host making the art) | The idea, Qloo tastes (styles, aesthetics), the blank's print area | Image prompt, style notes, words in the art (if any) | No brand, person or franchise names in the prompt or the words (same code list). Words in the art go to the trademark screen |
| D3 | **Design approve or reject** (Approve on the design widget) | `judge_design`'s brief: blank, colors, artwork facts, listing | The existing judge reply: a check per rule, fixes, coach | `applyFacts` already overrides print size, transparency and colors. `ready` → go on. `revise` → apply fixes (new art when print size or transparency failed) up to `maxRevisions`, then drop the idea and take the next fallback |
| D4 | **Listing and colors** (feedback on the design widget) | The idea, competitor titles, the blank's in-stock colors | Title, description, 3 to 5 colors | Title ≤ 120 characters, keyword first; colors in stock only; re-judged in D3 |
| D5 | **Price** (the price on the design widget) | `price_product`'s quote (minimum price, breakeven), the median and range of competitor prices | Price with a reason ("match the median", "premium") | `max(model price, quote minimum)`, rounded up to a clean price. The model can raise the price, never lower it below the minimum |
| D6 | **Trademark** (the merchant's "publish anyway?") | `screen_trademark` hits | A plain summary of the hits (for the log only) | Any hit fails the idea. The model can't clear it |
| D7 | **Ad copy and angle** (Add to campaign; feedback on the ad widget) | Tavily's "why now" for the idea, Qloo's audience, up to 5 competitor ads from the Ad Library (text only) | Headline (≤ 40), primary text (2 to 3 lines), the video angle for each clip | Length limits; no prices, discounts or claims (word list); the model must not reuse a competitor's sentence (5-word overlap check against the competitor texts) |
| D8 | **Campaign settings** (Launch on the campaign widget) | The plan from `campaign_plan`, Qloo audience notes | Campaign name and an audience note for the summary | Budget = `min(budgetDaily, settings cap × products, 500)` in cents; objective, optimization goal and country come from code and settings, not the model. `campaign_spend_cap` is set when `maxAdSpend` is given. Created paused; nothing activates |

The system prompt for every decision says that the inputs from Qloo, Tavily, the Ad Library and Fourthwall are untrusted data (`UNTRUSTED` from `lib/trends.ts`). Replies go through zod. A malformed reply retries once at temperature 0, then fails the step.

### 3. Research: Qloo for who, Tavily for why now, competition for how crowded

- **Qloo, "who and what they love":** `GET https://api.qloo.com/v2/insights` with `X-Api-Key` ([deep dive](https://docs.qloo.com/reference/insights-api-deep-dive)).
  - The niche is resolved to tags (`signal.interests.tags`, found through Qloo's tag search) and, if given, an audience (`signal.demographics.audiences`).
  - Insights are fetched for `filter.type` `urn:entity:brand`, `urn:entity:movie`, `urn:entity:tv_show` and `urn:entity:artist` (`take` 10 each).
  - Output: the audience's top affinities and tags, used for demand scores (D1), art direction (D2) and the audience note (D8). Entity names are never put into art or copy; they describe taste only.
  - `QLOO_API_KEY` is already declared in `env.ts` and `infra/index.ts`. New `lib/qloo.ts`; check for an official SDK first (none was found while planning).
- **Tavily, "why now":** `research_trends`' existing news search for the niche (past week). Its ideas are D1's candidates; its sources give the hook for D7.
- **Marketplace competition:** a Tavily search per candidate with `includeDomains: ["etsy.com", "redbubble.com", "amazon.com"]`, basic depth, 10 results.
  - Saturation = how many results match the idea's key phrase (a heuristic, labeled as such in the log).
  - Competitor prices: Nemotron pulls prices from the snippets into `{ price, currency, url }[]` (zod-checked), and code takes the median and the range. Snippets without a price are skipped.
- **Meta Ad Library:** `ads_library_search` on the theme, through the merchant's Meta connection, once Meta lands in #19 (chunk 7).
  - The count of active ads is a demand signal: some active ads means proven demand, very many means saturated (D1).
  - The top 5 ads' text goes to D7 as angle inspiration. The prompt says don't copy, and code checks for overlap.
  - Without a Meta grant this step is skipped and logged as skipped.

### 4. Text to image: GPT Image 2.5 on the merchant's fal

- **Model:** `openai/gpt-image-2.5/flare/text-to-image` on fal, called with the merchant's fal grant through `lib/upstream.ts` (`submit_job` then `check_job`). It does typography well and takes `background: "transparent"` with `output_format: "png"` (fal model page). `sunburst` is the slower premium variant and not worth it here.
- **Size:** a custom `image_size` of 2400 × 3200, which is 12 × 16 in at 200 px per inch. That's over the 150 px/in wovain needs (1800 px wide for 12 in), and inside fal's limits: multiples of 16, longest edge 3840, at most 8,294,400 pixels. Generating at print size skips the upscale step, and the alpha channel survives. `quality: "high"`.
- **Cost:** fal lists 2560 × 1440 at $0.055 and 3840 × 2160 at $0.100 (high). 2400 × 3200 (7.7 MP) should be about $0.09 to $0.10 per image (estimate; a verify step checks the real charge), plus prompt tokens at $5 per 1M (negligible).
- **Fallback:** if transparency fails, run `fal-ai/bria/background/remove` ($0.018 per image).
- **Nebius images:** FLUX dev and schnell were on Nebius AI Studio (now Token Factory) from January 2025. Nebius's 2026 pages don't confirm them, they have no transparent output, and they draw text poorly. Not used (unverified for 2026).
- **Overlap with #4:** this is #4's server-side generator. `lib/artwork.ts` (generate, judge, trademark) is written once and used by autopilot and by #4's design-widget path.

### 5. Publishing, ad creative, campaign

- **Fourthwall** (merchant's grant, `upstream.call({ id: "fourthwall", ... })`):
  - Same order as `playbooks/design.ts`: `get-instructions`, `ecommerce_get-current-shop`, `load-skills`; then catalog, details, upload (#19's `upload_artwork`), mockups, pricing, `create-offers-from-designs`, `bulk-update-offer-variant-prices`.
  - `update-offer-status` to `PUBLIC` only with `publish: "live"`. Each product is saved with `record_design`'s record (status `live` or a new `hidden`).
- **Ad creative:** `video_plan` gives the fal requests. They're submitted through the merchant's fal grant, with MMAudio after. `record_ad` saves them as added. With `videos: false`, only the static mockup goes in.
- **Meta** (merchant's Meta grant, #19 chunk 7):
  - The account checks and build from `playbooks/campaign.ts`, done in code: payment method, Page, pixel, uploads, campaign, ad set, creatives, ads. `hide_ui: true` and `self_ai_disclosure` come from settings.
  - `create_rules` runs as in the campaign step (its #19 form).
  - A missing payment method or pixel doesn't fail the run. It ends `done` with the PRD's "Ready, blocked" reasons in the summary.

### 6. Safety and spend

| Guard | How |
| --- | --- |
| Campaign paused | The Meta Ads MCP creates campaigns, ad sets and ads in PAUSED or draft state. The autopilot allowlist leaves out `ads_activate_entity`, and `ads_update_entity` is rejected when its arguments carry a status. A test reads the allowlist |
| Products hidden | Default `publish: "hidden"`. Fourthwall creates offers HIDDEN, so no extra call is needed |
| Run cost cap | `maxSpend` (USD, default $5, at most $25). Before each paid step, code adds the step's estimate (fal list price from `lib/fal-pricing.ts`, Nemotron and Tavily estimates) to the run's spend; if it would exceed the cap, the run stops as `capped`. Actual fal cost is read back when the merchant's fal MCP reports it (`search_request_history`, unverified) |
| Ad budget cap | Code computes the budget (D8); the model never sets it. Optional `maxAdSpend` becomes `campaign_spend_cap` |
| Run log | `users/{userId}/autopilotRuns/{runId}` holds the inputs, status, current step, lease, spend and created IDs. `users/{userId}/autopilotRuns/{runId}/events/{n}` holds one doc per step or decision, so the 1 MB document limit never bites |
| Idempotent re-run | `runKey` (default: a hash of the inputs and the date) is the run's document ID, created in a transaction. Each step checks its saved output first. Fourthwall offer creation saves the `customizationId` before the call and looks up offers for it before retrying. The Meta build saves each object ID as it's created and reuses a draft campaign with the run's name |
| Kill switch | `autopilot_stop` sets `stopRequested`; the step loop checks it before every step and between submit and poll. The operator switch `WOVAIN_AUTOPILOT=off` makes `autopilot` refuse and makes the task handler stop every run at its next step. The per-user `autopilot.enabled` setting is off by default |
| Concurrency | One active run per user (a transaction on `users/{userId}/autopilotRuns` with status `running`). A lease of 90 s on the run doc stops two tasks running the same run |
| Quotas | #19's per-user limits on Nebius, Tavily and Qloo calls apply to the run's calls too |

### 7. Interface

```ts
autopilot({
  idea?: string,            // one idea, or
  niche?: string,           // a niche or audience to research (one of the two is required)
  count?: 1 | 2 | 3,        // products to make (default 1)
  budgetDaily: number,      // USD per day for the whole campaign; capped by settings
  maxAdSpend?: number,      // USD, becomes campaign_spend_cap
  maxSpend?: number,        // USD cap on generation cost for this run (default 5, max 25)
  publish?: "hidden" | "live", // default "hidden"
  videos?: boolean,         // default true
  runKey?: string,          // idempotency key (default: hash of inputs + date)
}) → { runId, status, widget }

autopilot_status({ runId? })  // latest run when omitted: steps, decisions, spend, links
autopilot_stop({ runId })
autopilot_resume({ runId })   // after needs_connection, failed or capped (with a higher maxSpend)
```

- Run statuses: `queued`, `running`, `needs_connection`, `stopping`, `stopped`, `capped`, `failed`, `done`.
- `get_playbook` gains an `autopilot` entry. The host agent only calls `autopilot`, shows the widget, and relays `needs_connection` links.
- **Run-status widget** (`show_autopilot_widget`, `apps/widgets`):
  - one coach line;
  - the steps as a vertical list with state icons;
  - per product: the mockup, the price and why, the judge score, the trademark result, and Hidden or Live;
  - the decisions, collapsed, each with its reasoning;
  - spend so far against `maxSpend`;
  - a Stop button (`callTool("autopilot_stop")`) while running, and "Open in Ads Manager" when done.

  It polls `autopilot_status` every 5 s while the run is active (`callTool`), and stops polling when the run ends or the widget is hidden. Storybook stories cover running, needs connection, capped, failed and done, light and dark. Wireframe:

```
┌─ Autopilot · cat lovers · run r3 ────────────────────────────┐
│ "Two designs passed; one tee is ready, the ads are rendering."│
│ ✓ Research   ✓ Ideas   ✓ Art   ✓ Judge   ✓ Product  ◐ Ads  ○ Campaign │
│ ┌──────┐ Sakura Cat Tee · $30 (median $28) · judge 86 · TM ✓ · Hidden │
│ │mockup│ "Why: high cat+anime affinity, 3 news hooks this week"│
│ └──────┘                                                      │
│ Spend $1.12 of $5.00                                          │
│ [ Stop ]                                    Decisions (8) ▸   │
└──────────────────────────────────────────────────────────────┘
```

### 8. Cost per run (one product, list prices, Oct 22, 2026)

| Item | Count | Cost |
| --- | --- | --- |
| GPT Image 2.5 high, 2400 × 3200 (fal, merchant pays) | 1 to 3 (up to 2 revisions) | $0.10 to $0.30 (estimate) |
| Background removal (only if alpha fails) | 0 to 1 | $0 to $0.02 |
| Videos: MiniMax H3 Max Reference + MMAudio (fal, merchant pays) | 2 | $1.53 |
| Nemotron 3 Super (Nebius, operator pays) | about 12 calls, about 60k input / 15k output tokens | about $0.03 at $0.30 / $0.90 per 1M (third-party listing, unverified) |
| Tavily (operator pays) | about 6 basic searches (2 news, 2 marketplace, 2 trademark) | about $0.05 (unverified credit price) |
| Qloo (operator pays) | about 5 insight calls | unknown (hackathon key; no published price found) |
| Fourthwall, Meta (paused) | n/a | $0 |
| **Total** |  | **about $1.70 typical, $1.95 worst case**; $0.20 to $0.40 with `videos: false`; 3 products about $5 to $6 |

Ad spend is $0 until the merchant turns the campaign on.

### 9. Learning loop (later phase, with #5)

- Each run stores the idea features and D1 scores with the product ID and ad IDs.
- After the merchant launches the campaign, wovain reads two sources: `ecommerce_get-sales-by-utm-report` (each ad link carries `utm_content` = ad ID) and Meta insights (`ads_insights_*`).
- #5's rules then kill or scale designs.
- The per-user `autopilot.weights` are refit from results: sales per $ spent against each score dimension. Start with a simple bounded update, ±0.05 per dimension per review, renormalized. Model-based fitting waits until there's enough data.
- Not built in this issue; the record shapes leave room for it.

## Areas of concern

- **Spending without a click.** fal spend on the merchant's account happens with no approval. Mitigations: the opt-in setting, `maxSpend`, estimates before each paid step, a Stop button, one run per user, and the log. Meta ad spend can't happen: nothing activates.
- **Hidden product plus a campaign.** Ads would point at a page shoppers can't open. The campaign is paused, and the summary and widget say "make the products public before turning the campaign on". #5's launch path should check this.
- **Model mistakes.** The model never chooses a tool or an amount. Every number it proposes is clamped by code, and code checks every rule it could get wrong (print size, transparency, colors, budget, price floor).
- **IP risk.** A best-effort filter, not legal clearance: the code name list, the model's `ipSafety` score, the strict trademark screen, and no Qloo entity names in art or copy. The widget says so (as #4 requires).
- **Copying competitors.** Competitor ads and listings are inspiration only. The prompt forbids reuse, and a 5-word overlap check rejects copied copy.
- **Prompt injection.** Every third-party text is data, marked untrusted in prompts, and passed as JSON. The model's output can't trigger tools.
- **Task endpoint abuse.** `/tasks/autopilot` accepts only Cloud Tasks OIDC tokens for the task service account and audience. The body names a run that must exist for that user.
- **Undocumented limits.** The App Hosting request timeout, Nemotron tool calling, and Qloo and Tavily prices are unverified. The design doesn't depend on the first two: every step is short and decisions use JSON mode. Spend tracking uses estimates when actuals aren't available.
- **Meta App Review.** Until Meta connects through wovain for everyone, only Meta app testers get the campaign step. Everyone else ends at `needs_connection` (Meta) with the products and ads ready.
- **Hackathon visibility.** The Nemotron decisions and their reasoning show in the widget and in `autopilot_status`, so the demo shows Nemotron deciding.
