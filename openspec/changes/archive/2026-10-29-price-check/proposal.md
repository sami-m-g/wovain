# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/168

## Why

Changing a price on the Store shows the price now and after, nothing more. Someone new to print-on-demand can't tell whether a price loses money on a larger size or leaves room to pay for ads. Fourthwall's MCP server returns what it charges to make each size (`ecommerce_get-customization-pricing`), so wovain can check a price before it goes out.

## What Changes

- The reprice dialog shows, for every size: Fourthwall's cost, the price, the profit after card fees, tax and the refund reserve, and the gross margin. It updates as the merchant types.
- A verdict: loss, below wovain's floor, thin (under the 60% gross margin DTC stores keep to pay for ads, from the nexscope profit-margin-calculator-shopify skill) or healthy. One click sets wovain's floor price or the 60% price.
- The server refuses a reprice that loses money in any size, naming the size and the lowest price that works.
- The price and profit maths take the rules as an argument (`profitUnder`, `priceUnder`), so the browser runs the same check.

## Capabilities

### Modified Capabilities

- `store-management`: the price check.

## Impact

`packages/core` (`price-check.ts`, pure rules in `pricing.ts`), `packages/api` (`store.priceCheck`, the reprice refusal), `apps/web` (the price check in the reprice dialog, messages, docs FAQ and the landing FAQ in en, es and fr).
