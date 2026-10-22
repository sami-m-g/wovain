# Verify: connect Meta through wovain

## Tests added

- `test/integration/upstream.test.ts`, "Meta, a hand-registered client": a Meta-style fake (no CIMD, no DCR, no `offline_access`) connects with the static app ID. It sends `redirect_uri` `/oauth/callback/meta` and only wovain's six scopes, and exchanges the code with that client ID. The grant then runs a tool and hands out its access token. Without the app ID, Meta can't be connected while fal still can. Without a grant, the token is a connect link. `disconnect` forgets the grant.
- `test/integration/connect.test.ts`, "launch confirm page":
  - The merchant signs in, sees the campaign and confirms it once; a replayed POST gets 403.
  - A different wovain account gets 403, and no approval exists.
  - A POST is refused without the CSRF token, with a guessed token, without the page's cookie, or from another Origin.
  - An unknown link gets 400.
- `test/integration/campaign-tools.test.ts`:
  - `campaign_draft` records the campaign Meta staged and sends only allowlisted arguments with the plan's budget. It refuses a lifetime budget, a spend cap, a status, an ad-set budget, a nested targeting extra, an ad set under another campaign, a link that isn't an added product, and an upload that isn't an added ad's media. It accepts a product link with the plan's tags and an added ad's video.
  - `create_rules` uses the merchant's token with the right `appsecret_proof`, only on the staged campaign and ad account.
  - Before the merchant connects Meta there's a connect link, and without wovain's Meta app the reply is `configured: false`.
  - `meta_ads` refuses `ads_activate_entity`.
  - The model alone can't launch: `request_launch` returns only the confirm link, and `launch_campaign` refuses without a confirmation.
  - A confirmed launch publishes the staged campaign and its draft, once.
  - Objects outside the draft are refused, and the launch stops when the draft's budget, objective or spend cap differs from the plan.
- `test/integration/app.test.ts`: `/privacy` and `/data-deletion` answer 200.

## Checks run

All pass: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test` (86), `pnpm test:integration` (109), `pnpm build`, `pnpm --filter @wovain/widgets test:stories` (32). No `pulumi up` or `infra:preview` was run.

## Review findings

- Self-review: `create_rules` used to record any campaign ID. Now it marks rules only on the staged one.
- First security review (two MEDIUM findings): the model could launch, and `campaign_draft` used a denylist. Fixed with strict per-tool allowlists. The first launch fix, an app-only ticket, was replaced after the next review.
- Second security review:
  - HIGH: `ui.visibility: ["app"]` isn't access control. Launch now needs the merchant's confirmation on wovain's own page. They sign in through AuthKit in their browser, bound to the browser by a nonce cookie and checked as the same user. Confirm is a POST with a CSRF token, a SameSite=Strict cookie and an Origin check. No tool returns a launch token.
  - MEDIUM: the campaign ID is recorded only from Meta's `ads_create_campaign` reply, and rules and launch refuse any other ID. The draft is read back before publishing and checked against the plan.
  - MEDIUM: links must be an added product's, and uploads an added ad's media.
- The `/simplify` skill and the `pr-review-toolkit` agents aren't installed in this environment, so they weren't run.

## Try it

1. Set `meta-app-id` and `meta-app-secret` (README, Meta app), add yourself as a tester, and deploy.
2. In ChatGPT, run the campaign step. `meta_ads` gives a connect link; approve on Meta.
3. The draft builds through `campaign_draft`, and `create_rules` adds the rules.
4. On the widget, press Launch. Sign in on wovain's page, check the budget and press Confirm. Back in the chat, say you confirmed: `launch_campaign` publishes.
5. Check `/privacy` and `/data-deletion`.

## Departures from the plan

- Launch is a human confirmation on wovain's page (`routes/launch.ts`, `lib/launch-approvals.ts`, `request_launch`), as the security reviews asked. The campaign widget opens that page.
- `campaign_draft` uses allowlists and plan checks instead of stripping spend keys.
- Split out to stay under the file-length limit: `lib/campaign-plan.ts` (the added products, budget and draft plan) and `tools/meta.ts`. `packages/shared/campaign.ts` gains `launchVia` and `launchRequestSchema`.
- Not verified live until a tester runs it: whether Graph accepts the MCP grant on `adrules_library`, the field names in `ads_get_ad_entities` (wovain reads `objective`, `daily_budget` or `campaign_daily_budget`, the lifetime budget, spend cap and bid fields, and `ad_object_id`), and the `campaign_id` key in Meta's `ads_create_campaign` reply. If any differs, the tools stop rather than spend.
- MCP elicitation wasn't used: the confirm page reuses the connect flow's sign-in, and ChatGPT's elicitation support is unverified.
