# Spec: connect Meta through wovain

Intent: [intent.md](intent.md)

## Requirements

1. `providers.meta` is `https://mcp.facebook.com/ads`, titled Meta. Its authorization server (`https://www.facebook.com/ads`, probed 2026-10-22) refuses DCR for unknown clients and doesn't advertise CIMD. It supports PKCE with `token_endpoint_auth_methods_supported: ["none"]` and issues tokens from `graph.facebook.com/v26.0/oauth/access_token`.
2. wovain asks Meta for `ads_mcp_management ads_management ads_read business_management pages_show_list pages_manage_ads`, not all nine scopes the resource advertises. Catalog and Instagram scopes would also need App Review.
3. `META_APP_ID` and `META_APP_SECRET` (Pulumi secrets `meta-app-id`, `meta-app-secret`) are optional. Without the app ID, Meta tools answer `configured: false` and `/connect/meta` refuses. The client information is `{ client_id: META_APP_ID, client_secret?: META_APP_SECRET }`. The SDK picks `none` because that's the only method Meta's token endpoint lists.
4. `meta_ads` proxies only read-only and reporting tools: accounts, Pages, datasets, entities, images, videos, creatives, previews, errors, insights, opportunity score, activity logs, field context and help articles.
5. `campaign_draft({ tool, arguments })` stages one object of the campaign draft on the merchant's grant. The allowed tools are `ads_creative_upload_media` (URL only), `ads_create_campaign`, `ads_create_ad_set`, `ads_create_creative` and `ads_create_ad`. Each has a strict zod allowlist of argument keys with the playbook's fixed values (objective, optimization goal, call to action), and nested specs (`promoted_object`, `targeting`, `creative`) are checked as strict objects too. Any other key is refused, so lifetime budgets, spend caps, bids and status never reach Meta. Meta's create tools take no status and stage every object paused. wovain sets `hide_ui: true` and the job, and puts the plan's daily budget on the campaign. It needs at least one added ad widget.
6. Launch is bound to the merchant's press of Launch (changed in security review). `approve_launch({ campaignId })` and `launch_campaign({ launchToken, objectIds? })` are widget-only tools (`ui.visibility: ["app"]`). The Launch button calls `approve_launch`, which mints a single-use launch ticket (`launchTickets/{id}`: user, recorded campaign, 2 minutes). `launch_campaign` consumes it, reads the campaign's draft objects (`ads_get_ad_entities`, `object_state: "draft"`), refuses any `objectIds` outside them, and publishes the campaign with them (`ads_activate_entity`, `publish_as_active: true`). The widget then tells the chat to check the result. The agent never launches; without a wovain Meta grant the Launch button still asks the agent to launch through the host's connector.
7. `create_rules` reads the merchant's Meta access token (refreshed like any proxied call) and calls Graph `adrules_library` with it, plus `appsecret_proof` when the app secret is set. Without a grant it returns the connect link. Without the Meta app it says the rules wait for wovain's Meta app.
8. `disconnect({ provider })` deletes the merchant's stored grant for any provider.
9. `/privacy` and `/data-deletion` are short static pages. Meta accepts a data-deletion instructions URL instead of a callback, and the only Meta data wovain keeps is the encrypted grant, which `disconnect` deletes.
10. `META_SYSTEM_USER_TOKEN` leaves `env.ts`, `.env.example`, `apphosting.yaml` and `infra/index.ts`.

## Design

- Reused: the SDK's `auth()` and `StreamableHTTPClientTransport`; `FirestoreOAuthProvider`, which gains a static `client`; `createUpstream`, which gains `clients` and `accessToken`; `upstreamReply`; the connect routes, unchanged beyond the provider enum; `lib/meta-graph.ts`, now with a token per call.
- Not used: Meta's Business SDK for Graph (two calls don't justify it), and a data-deletion callback (it needs a Facebook-user-to-wovain-user mapping, and the instructions URL is enough).

## Areas of concern

- **Spending:** nothing in `meta_ads` or `campaign_draft` can publish. Meta's create tools have no status input and stage drafts. Only `launch_campaign` publishes, and only the saved campaign.
- **Confused deputy:** gone, because Graph checks the merchant's own token.
- **Budget tampering:** the draft's campaign budget is overwritten from the plan.
