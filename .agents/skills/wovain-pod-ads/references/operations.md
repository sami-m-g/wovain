# Operations

What happens after a sale reaches the ads here. Fourthwall has no webhook for refunds, returns, chargebacks, production errors or the blank catalog, so these come from the reconciliation poll as well as from `ORDER_UPDATED` and `PRODUCT_UPDATED`.

### POD-O1 Can't ship

When the blank, every color a design is listed in, or the sizes that carry most of its sales go out of stock or are discontinued (`PRODUCT_UPDATED`, catalog check), build `pause_product_ads` for every ad on that product. It is proposed at once, with no settle wait, because it rests on Fourthwall's stock, not on sales counts. It is risky: it waits for the merchant's approval, and it counts toward `maxAutoPausesPerDay` and the cooldown like any other pause. A single discontinued color that the ads show builds `refresh_creative` instead. `resume_product_ads` follows when stock returns, only for ads this rule paused.

### POD-O2 Refund spike

A design's refund and return rate over the last 30 days is at least `refundSpikeMultiple` (2) times the shop's, on at least 3 orders: propose `quality_check` (advice). The design's kills and scales wait until the merchant answers. Whether Fourthwall exposes a refund reason is unverified; if it does, the brief quotes it.

### POD-O3 Fulfillment delay

Orders sitting in `CONFIRMED` or `IN_PRODUCTION` past Fourthwall's stated production time for that blank raise `fulfillment_delay`. Read the production time from Fourthwall's `omni_knowledge`, not from a table in code (unverified per blank). One late order is an `ops_alert`. Late orders on most of a product's recent sales also build `budget_down` on that product's ads (risky), since new buyers will wait too.

### POD-O4 Production errors

Fulfillments Fourthwall skipped or cancelled in production (`ecommerce_get-fulfillment-details`) raise an `ops_alert`, and propose `pause_product_ads` (risky, as in POD-O1) when they repeat on one product. An order the buyer cancelled is not a production error and never counts.

### POD-O5 Shipping and chargebacks

Orders `SHIPPED` with no `DELIVERED` past the carrier window, shipping address changes after shipping, and chargebacks raise an `ops_alert`. Chargebacks also reverse the sale in the ledger (POD-E6). Whether chargebacks show in Fourthwall's payout transactions is unverified.
