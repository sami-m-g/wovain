# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/38

## Why

The drop shows each product's price but not why. A designer new to print-on-demand can't see what Fourthwall charges to make it or what a sale leaves them before publishing. On next, `store.priceCheck` also failed for every product: Fourthwall's pricing reply holds each size's cost as an object (`pricing[].perSize[].cost`), which the reader didn't take as a price.

## What Changes

- Each product card in the drop's products step, and the publish confirm, shows Fourthwall's base cost (the cheapest size), the profit per sale and the margin after card fees, tax and the refund reserve, with the pricing rule in one line below. The figures come from `store.priceCheck` and `checkPrice`, the same maths as the Store's reprice dialog.
- The cost reader takes a size's cost when it is a Money object with a numeric or string value, or an object that holds its parts and their total (the largest price in it). The error log's reply shape goes three levels deeper.
- Docs (creating a drop, Store, billing) and the landing FAQ in en, es and fr.

## Capabilities

### Modified Capabilities

- `design-drops`: the price breakdown on the drop's products.

## Impact

`packages/core` (`fourthwall-drops.ts` cost reader, `upstream.ts` shape depth), `apps/web` (the products step and publish confirm, messages, landing FAQ), `apps/fumadocs` (guides in en, es and fr).
