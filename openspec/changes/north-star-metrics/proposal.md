# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/145

## Why

The founder's north star is a first live campaign within 10 minutes of sign-up and a first profit within an hour. Only six funnel events exist (`sign_up`, `connect_provider`, `run_started`, `design_approved`, `product_published`, `campaign_created`), and `campaign_created` is a paused campaign, so neither time can be measured or charted.

## What Changes

- Server-side milestone events, each sent once per merchant with `reached_at` and `seconds_since_signup`: `signed_up`, `connection_completed {provider}`, the setup steps `fourthwall_shop_ready`, `payouts_ready`, `meta_payment_ready`, `meta_page_ready`, `pixel_ready`, then `first_drop_started`, `design_approved`, `products_published`, `campaign_started`, `campaign_delivering`, `first_sale {order_value, profit}` and `first_profitable_product {ad_spend, net_profit}`.
- A `milestone` table records the first time of each step, so a step is reported once and the Insights page can time the journey.
- Insights reads Fourthwall and Meta and records what they show: a campaign no longer paused, a first impression, an order, and Fourthwall profit minus Meta spend above zero.
- Two KPIs: time to first live campaign (`signed_up` to `campaign_started`, target 10 min) and time to first profit (`campaign_delivering` to `first_profitable_product`, target 60 min). Meta's review wait (`campaign_started` to `campaign_delivering`) is shown apart.
- A "North star" PostHog dashboard in `infra/posthog` with the funnel of where merchants drop, the two KPIs, the review wait and the minutes per step. Both KPIs are in `kpis.yml`, so each gets an alert.
- The Insights page shows the three durations.

## Limits

- Fourthwall exposes no payout state through its MCP tools yet, so `payouts_ready` is defined and charted but not emitted.
- Events fire when wovain sees the state (at the merchant's visit to Insights), not at the moment Meta or Fourthwall changed it.

## Capabilities

### Modified Capabilities

- `analytics-kpis`: the north star events and the two time KPIs.

## Impact

`packages/api` (milestones, detect, insights), `packages/core` (setup probes, campaign status), `packages/auth` (`signed_up`), `packages/db` (`milestone` table and migration), `apps/web` (Insights tiles, messages in en, es and fr), `infra/posthog` (dashboard, insights, `kpis.yml`).
