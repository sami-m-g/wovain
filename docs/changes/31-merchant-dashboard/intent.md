# Intent: Merchant dashboard

Issue: #31

## Problem

> Build the merchant dashboard for wovain. It's one ChatGPT widget that shows, at a glance: Fourthwall sales (revenue, orders, profit and AOV over time; top products; sales by UTM, mapped to ads); Meta ad results (spend, purchases, ROAS and CPA per campaign, ad and concept); the reconciliation between Fourthwall sales and Meta-reported purchases; the products wovain created, with their status (hidden or live); recent autopilot runs and their decisions; the optimizer's actions and recommendations (once the optimizer lands); connection status (Fourthwall, fal, Meta).

After launch, a merchant has no single place to see whether wovain's products sell and whether the ads pay for themselves. The numbers sit in Fourthwall analytics, Meta Ads Manager and wovain's own records.

## Desired outcome

- `show_dashboard` draws the dashboard widget; `dashboard_data({ range })` gathers every section in parallel, through the merchant's own Fourthwall and Meta connections and wovain's records, cached briefly per merchant.
- A missing connection shows a "Connect X" card that uses `connect_account`.
- The optimizer's action records show when they exist; nothing depends on them.
- Stories for loading, empty, partial connections and full data, light and dark; unit and integration tests; a dashboard step in the e2e journey and the demo.

## Constraints

- Each merchant sees only their own data (their own grants, their own records); upstream text is untrusted; nothing from the reports is logged; inputs and outputs are bounded.
- ChatGPT widget rules: system fonts, brand color only on primary elements, at most 2 buttons, no tabs or inner scrolling; charts readable in light and dark.
- Small: reuse `economics.ts`, the optimizer's `math.ts` and `reconcile.ts`, and `lib/upstream.ts`.

## Open questions

None blocking. The reply shapes of Fourthwall's report tools and Meta's `ads_get_ad_entities` are unverified live (no signed-in Fourthwall shop here); the reader takes the documented column names from any envelope.
