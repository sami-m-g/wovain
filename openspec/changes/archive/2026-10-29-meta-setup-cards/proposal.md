# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/177

## Why

A first-time seller can't run an ad until their Meta account has an ad account, a payment method and a Facebook Page, and wovain's safety rules need Graph permissions on the same grant. Today wovain only fails later, at campaign time, and leaves the seller to find the right Meta screens alone.

## What Changes

- `@wovain/core/meta-setup`: reads the ad account (status, `has_payment_method`, business), its Pages and Instagram accounts through the Meta Ads MCP, and turns them into cards: `ad_account`, `payment`, `page`, `instagram` (optional), `safety_rules`. Steps only the owner can take are deep links to the exact Meta screen (billing hub payment settings, business settings Pages or Page creation, Instagram accounts, account quality).
- `@wovain/core/meta-graph`: with the merchant's single Meta grant (the MCP token, issued by Graph's own token endpoint), reads `/me/permissions` and `/act_<id>/adrules_library` to tell whether the safety rules can run; a refused token or a missing permission asks for a reconnect. The upstream session hands `work` the grant's current access token.
- `store.metaSetup`, polled by the Store page next to the Store setup checklist; `meta_payment_ready`, `meta_page_ready` and the new `meta_graph_ready` milestones.
- Reconnect (re-consent over the same grant) next to Disconnect on Connections and on the Meta card.
- Docs (en/es/fr): "Connecting accounts" explains the cards.

## Impact

- `packages/core/src/{meta-setup,meta-graph,upstream,core}.ts`, `packages/api/src/flow/{meta-setup,connections,milestones,actor}.ts`, `packages/api/src/routers/store.ts`
- `apps/web/src/components/store/{meta-setup,store-setup,store-dashboard}.tsx`, `apps/web/src/components/app/connections-panel.tsx`, `apps/web/src/lib/flow-client.ts`, messages
