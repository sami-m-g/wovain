# Verify: connect Meta through wovain

## Tests added

- `test/integration/upstream.test.ts`, "Meta, a hand-registered client": a Meta-style fake (no CIMD, no DCR, no `offline_access`) connects with the static app ID, sends `redirect_uri` `/oauth/callback/meta` and only wovain's six scopes, exchanges the code with that client ID, and then runs a tool and hands out the access token. Without the app ID, Meta can't be connected while fal still can. Without a grant, the token is a connect link. `disconnect` forgets the grant.
- `test/integration/campaign-tools.test.ts`:
  - `create_rules` uses the merchant's own token with the right `appsecret_proof`, skips existing rules and records the campaign. It returns the connect link before Meta is connected, and `configured: false` without wovain's Meta app.
  - `campaign_draft` sends only allowlisted arguments with the plan's budget and Meta's widgets hidden. It refuses a lifetime budget, a spend cap, a status, an ad-set budget and an extra nested targeting key.
  - `meta_ads` refuses `ads_activate_entity`.
  - `approve_launch` and `launch_campaign` are app-only. A Launch press publishes the recorded campaign with its draft objects. `launch_campaign` refuses without a ticket, refuses a reused ticket, and refuses objects outside the campaign's draft. `approve_launch` approves only the recorded campaign.
- `test/integration/app.test.ts`: `/privacy` and `/data-deletion` answer 200.
- `test/integration/connect.test.ts` (unchanged) still passes: `client.json` lists only the CIMD callbacks.

## Checks run

All pass: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test` (86), `pnpm test:integration` (99), `pnpm build`, and `pnpm --filter @wovain/widgets test:stories` (32). No `pulumi up` or `infra:preview` was run.

## Review findings

- Self-review: `create_rules` now records the campaign before calling Graph, so Launch still finds it when Meta refuses the rules.
- Security review, two MEDIUM findings, both fixed:
  1. Launch could be reached through prompt injection, since the model could call `launch_campaign`. Launch now needs a single-use, 2-minute ticket that only the widget's Launch button mints (`approve_launch`). Both tools are widget-only, and only the campaign's own draft objects are published.
  2. `campaign_draft` filtered arguments with a denylist. It now uses strict allowlists per tool, with nested specs checked and unknown keys refused.
- The `/simplify` skill and the `pr-review-toolkit` agents aren't installed in this environment, so they weren't run.

## Try it

Set `meta-app-id` and `meta-app-secret` (README, Meta app), add yourself as a tester, then deploy. In ChatGPT, run the campaign step: `meta_ads` gives a connect link, you approve on Meta, the draft builds through `campaign_draft`, `create_rules` creates the rules, and the widget's Launch publishes. Check `/privacy` and `/data-deletion`.

## Departures from the plan

- Launch moved into the widget: `approve_launch` plus app-only `launch_campaign` (security review).
- `campaign_draft` uses allowlists instead of stripping spend keys (security review).
- `lib/campaign-plan.ts` (the added products and budget) and `tools/meta.ts` (the draft and launch tools) were split out to stay under the file-length limit. The campaign widget and `packages/shared/campaign.ts` (`launchVia`, `launchApprovalSchema`) changed for the widget launch.
- Unverified until a tester runs it live: whether Graph accepts the MCP grant on `adrules_library`, and the exact shape of `ads_get_ad_entities`. wovain collects every `ad_object_id` in that reply.
