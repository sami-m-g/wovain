# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/327

## Why

The founder wants a drop's campaign to go live when the seller approves it, without a second trip to Meta Ads Manager. wovain already activates an approved campaign behind the `media-buying-live` flag, but nothing checks that the spend rules (`ads-profit-rules`) and Meta's automated-rule backstop (`meta-backstop-rules`) are in place first. A campaign could start spending with nothing watching it.

## What Changes

- Before it asks for an activation, and again before it activates an approved one, wovain syncs the backstop and reads the ad account's automated rules back (`requireSpendGuards` in `packages/mastra/src/mastra/flow/backstop.ts`). It refuses to activate when the `ads-profit-rules` or `meta-backstop-rules` flag is off, or when Meta doesn't hold every rule of the campaign.
- The explicit approval stays: nothing goes live without the seller's click.
- Copy (en, es, fr), the landing page, the guide and the developer docs say wovain starts the campaign when the seller approves it, once its spend rules are in place.

## Impact

- `packages/mastra/src/mastra/flow/{backstop,media}.ts` and their tests.
- `apps/web/messages/*.json`, `apps/web/src/content/*.ts`, the docs site.
