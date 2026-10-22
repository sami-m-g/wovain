# Economics

A print-on-demand tee at $30 leaves about $10 per sale before ads, so one sale moves CPA a lot. These rules build on `ads-math` and `ads/references/budget-allocation.md`.

### POD-E1 Breakeven per sale

Breakeven per sale is `breakeven(price, baseCost, economics).perSale` from `packages/shared/src/economics.ts`, on the base cost Fourthwall quoted for the blank. Break-even CPA equals breakeven per sale. Break-even ROAS is `price / perSale`, already `roas` in `Breakeven`.

### POD-E2 Margin per size

The planned breakeven uses the priciest size. Once a design has sales, compute the realized breakeven from the actual size mix in Fourthwall orders. When 2XL and up carry enough of the mix that realized breakeven falls more than 10% below plan, raise `size_mix_erodes_margin` and propose a `price_change` on those sizes only (Fourthwall prices per variant).

### POD-E3 Price room

Offer a price change only above the pricing rule's minimum (`priceProduct`), never below it, and show the new breakeven and kill thresholds with it. Always needs the merchant's approval.

### POD-E4 Low AOV and bundles

When the shop has orders with two or more units and campaign CPA sits between 1× and 1.5× breakeven, price a two-item bundle (one shipping charge, one fixed card fee) and offer `bundle_offer` with its breakeven per order. Always needs the merchant's approval.

### POD-E5 Small samples

Kill and scale decisions use net sales and report a downside case. With fewer than three sales, confidence is at most `medium`.

### POD-E6 Refunds count

Contribution subtracts refunded and charged-back orders, with Fourthwall's fees on them where the profit report shows them. A design with a good ROAS on Meta and a high refund rate isn't a winner.

### POD-B1 Winner capped

A campaign spending its whole daily budget, with CPA on settled net sales under `scaleUnderMultiple` × breakeven and at least `scaleMinSales` net sales, is a capped winner: propose `budget_up` by at most `maxBudgetChangePctPerDay`, never past the merchant's cap, with base and downside cases at the marginal CPA (`ads-budget`). Scaling waits while a refund spike or tracking gap is open, and stops seven days before a seasonal design's ship-by cutoff (POD-S1).
