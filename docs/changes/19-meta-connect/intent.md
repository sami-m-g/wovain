# Intent: connect Meta through wovain

Issue: #19 (chunks 6 and 7 of the [architecture decision](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/issues/19#note_4068653948))

## Problem

Fourthwall and fal already connect to wovain through the merchant's own OAuth grant. Meta doesn't. The campaign playbook needs the Meta Ads MCP connected in the host, and `create_rules` writes rules with the operator's `META_SYSTEM_USER_TOKEN`. That token is a confused deputy: a public user could create rules on any ad account the operator's system user reaches. Meta's MCP refuses dynamic client registration, so wovain needs its own Meta app.

## Desired outcome

- `meta` is a third provider in the connections design. wovain's own Meta app is a pre-registered client: its app ID and secret are the Pulumi secrets `meta-app-id` and `meta-app-secret`, optional until set.
- A `meta_ads` proxy tool forwards read-only and reporting Meta Ads tools on the merchant's grant.
- wovain tools build and launch the campaign draft. Every object is created paused (Meta's create tools stage drafts), the budget comes from wovain's plan, and only the Launch step publishes.
- `create_rules` uses the merchant's own Meta grant, so it reaches only ad accounts the merchant can manage. `META_SYSTEM_USER_TOKEN` is gone.
- Privacy policy and data-deletion pages exist for App Review.
- Before App Review, only people with a role on the Meta app can connect. Everyone else keeps the host-MCP path.

## Constraints

- The OAuth mechanics come from `@modelcontextprotocol/client`, with static client information instead of CIMD or DCR.
- No `pulumi up`. Secrets go through `infra/` and `apphosting.yaml` like the others.
- Other sessions are editing `tools/design.ts`, `playbooks/design.ts`, `tools/ads.ts` and the ad widgets, so this change keeps to the connections, Meta and campaign files.
- Upstream text stays data, never instructions.

## Open questions

- Does Meta's Graph API accept the MCP grant on `adrules_library`? Unverified until a tester connects. The token comes from `graph.facebook.com/v26.0/oauth/access_token`, so it should be an ordinary user token with `ads_management`.
