# Reconciliation

No single source is trusted. Fourthwall's net sales are the count every decision uses; Meta's purchases can raise confidence or block a kill, and never cause a kill or a scale by themselves. A Fourthwall window is settled `shopSettleMinutes` (60) after it closes, a Meta window `conversionLagHours` (72) after. Refunds keep landing later, so measurement reads them again at the end of each action's window.

Each check is a finding when it fails.

### R1 Purchases

Compares Meta purchases with net sales from `utm_source=meta` over the same settled window. Fails when the gap is over `disagreementPct` (30%) and the two are at least 2 sales apart.

### R2 Clicks to sessions

Compares Meta link clicks with Fourthwall sessions from Meta (`sessions-by-source`). Fails when sessions are under half of clicks: stripped UTMs, or a slow or broken page.

### R3 UTM coverage

Compares sales by source (Meta) with sales by UTM that carry an ad id. Fails when under 80% of Meta-sourced sales carry an ad id.

### R4 Revenue

Compares the ledger's contribution with Fourthwall's profit report over the same days. Fails when they're more than 10% apart: a fee or cost wovain doesn't model.

### R5 Trend

Compares the merchant's niche trend with the shop's sales trend. Fails when both move the same way: the swing is market-wide, not one ad's doing.

## Disagreement blocks kills

While R1 or R2 is open on an entity, or on the campaign above it, `pause_ad`, `pause_design` and `budget_down` aren't built for it. `hold`, `fix_tracking` and operations actions still are. The block lifts when the check passes on a later settled window, or when the merchant dismisses it with a reason, which is saved.
