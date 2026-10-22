# Kills: ad versus design

claude-ads says no fixed CPA multiple may be the only reason to change an account (`ads-optimize`). wovain's multiples are thresholds the merchant approved in Settings (`rules.killNoSalesMultiple`, `rules.killDesignMultiple`), and they apply only on settled data from both sources with no open R1 or R2 (see `reconciliation.md`).

### POD-K1 Ad-level kill

One ad spent `killNoSalesMultiple` × breakeven on settled data with no net sale and no Meta purchase, while another ad on the same design has sold, or the ad's CTR is under half its siblings'. The design works and this creative doesn't. Propose `pause_ad` (safe), but never on the last active ad of a design.

### POD-K2 Design-level kill

All of a design's ads together spent `killDesignMultiple` × breakeven on settled data with no net sale, and the shop shows visits to the product with no sale. The product or the price is the problem, so a new creative won't fix it. Propose `pause_design` (risky), with `price_change` next to it when there's price room (POD-E3).

Meta's rules judge one object at a time, which is why `packages/shared/src/rules.ts` skips the design kill when a campaign holds more than one product. The optimizer covers that case.

### POD-K3 No clicks

Low CTR across all of a design's ads, with spend under the design kill line: the creative never got people to the page, so the design hasn't been judged yet. Propose `refresh_creative`, not a kill.

### POD-K4 Unsettled spend

Spend past the kill line on data that hasn't settled yet goes to the inbox as an early warning with `pause_ad` proposed. It is never applied on its own. Meta's own rules stay on as the safety net meanwhile.
