# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/131

## Why

The Products page is one long stack: shop readiness, store approvals, drops, products and orders. A small label checks its shop a few times a week: is it live, what sold, what waits for me, and a handful of changes (publish, hide, reprice, a refund, a code). The page makes them scroll past everything to find any of it, and it uses only part of what Fourthwall's MCP server can do.

## What Changes

- Products becomes **Store** in the rail, the breadcrumb and the title; `/dashboard/products` redirects to `/dashboard/store`.
- A summary strip: the shop's site status, readiness as one line with its fix (Go live for a coming-soon shop, a Fourthwall link otherwise), sales and orders for 28 days from Fourthwall's reports, actions waiting for the merchant, and payout status.
- Four tabs, the open one kept in `?tab=`: **Products** (thumbnail, status, price, margin and units sold from the top-products report, the drop it came from, filters, search, row actions and bulk publish, hide and retire), **Orders** (refund and cancel with Fourthwall's cost preview, then confirm), **Promotions** (discount codes for picked products, ending a live code, gift cards) and **Approvals**.
- A store preview: the shop's product renders laid out as a storefront grid, with drafts on request, and links to the storefront and Fourthwall's site editor. Fourthwall storefronts can't be framed.
- "Open in Fourthwall" deep links into the Fourthwall admin wherever wovain doesn't cover something.
- Drops leave this page; they belong to the drop flow.
- New store actions through the approval queue: `store.gift_card.create` (R4), `store.site.set_status` (R3, live only) and discount codes for picked products (`store.promotion.create` without a drop). Every write shows its impact before it is sent.

## Capabilities

### Modified Capabilities

- `store-management`: the Store page, the preview, deep links, gift cards, going live and shop-wide discount codes.

## Impact

`apps/web` (route, nav, Store components, messages in en, es and fr), `packages/api` (store flow and router), `packages/core` (store reads and writes on Fourthwall's MCP).
