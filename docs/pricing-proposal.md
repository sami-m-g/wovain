# wovain pricing proposal

**Status: proposal (2026-10-26, reviewed 2026-10-29 in #135).** Every number below is for you to lock in. They are per-environment config: `billingCatalog` in the stack's Pulumi file (`infra/next/Pulumi.next.yaml`, `infra/Pulumi.prod.yaml`), read as `BILLING_CATALOG` and validated by `packages/billing/src/catalog.ts`. The tests use `packages/billing/src/catalog-fixture.ts`. To change a number, change the stack's config and run `pnpm polar:seed`.

## Launch: Free only (decided 2026-10-26)

Only Free is live, so every merchant is on Free. This keeps wovain within the Qloo hackathon rules: Qloo is never part of a paid product.

- `/pricing` shows every tier. Studio, Label and the credit pack are marked **Coming soon**. They have no checkout button. Instead, "Notify me" sends a `paid_plan_interest` PostHog event, with no email form.
- The server flag `billing-paid-plans` is **off** by default. While it is off, `billing.checkout` refuses with `PAID_PLANS_NOT_AVAILABLE`, so there are no plan changes and no pack purchases. The flag is read through `packages/billing/src/flags.ts`, so it can move onto the typed flag registry from feat/progressive-delivery.
- When a merchant runs out of credits, the upgrade screens say "More credits are coming soon" and that Free's credits refresh every month. Nothing is sold.
- Free runs on Polar (sandbox for now) and grants its 40 credits a month.
- `pnpm polar:seed` creates the paid products **archived**, so nobody can buy them. To launch them: get Qloo's written permission or a commercial licence, run `POLAR_PAID_PLANS=on pnpm polar:seed`, then turn `billing-paid-plans` on.

## Promo codes for credits (2026-10-26)

Promo codes give free credits while only Free is live, and later they can run launch offers. They go through Polar's normal checkout, so there is no manual top-up: credits still come only from Polar's webhooks.

- **Defined in code.** `packages/billing/src/promos.ts` lists each promo: an id, the credits, the total redemptions, the end date, whether it is on, and who it is for. `pnpm polar:seed` makes each one a private, one-time credit pack product in Polar (its credits listed at `promoCentsPerCredit`, 10¢ a credit, so 300 credits list at $30). It also makes a 100%-off discount restricted to that product, with Polar's total and per-customer limits and the end date. An off promo's product is archived and its discount deleted.
- **No code in the repo.** The repository is public, so the seed generates a random 16-character code for each promo (80 bits) the first time it runs. It stores the code only in Polar and in Secret Manager (`polar-promo-<id>`) and never prints it. Read a code with `gcloud secrets versions access latest --secret=polar-promo-<id>` or in the Polar dashboard under Discounts. To choose a code instead, set the masked CI variable `POLAR_PROMO_CODE_<ID>`.
- **Redeeming.** Billing > Redeem a code calls `billing.redeem`. The server finds the code's discount in Polar, checks it, then opens a checkout with it applied. A $0 checkout needs no payment form, so the server confirms it and the merchant never leaves wovain. The webhook grants the credits as a pack grant (they never expire), notes `promo <id>` in the ledger, and sends `promo_redeemed` (the promo's id as `code`, the credits and the surface) to PostHog.
- **While paid plans are off,** only codes that make the checkout $0 are accepted. The server checks both the discount's terms and Polar's own `is_payment_required`. Otherwise it answers `PROMO_NOT_FREE`. The other typed errors are `PROMO_INVALID`, `PROMO_EXPIRED`, `PROMO_USED_UP`, `PROMO_ALREADY_REDEEMED` and `TOO_MANY_REQUESTS`.
- **Abuse limits.** Each code has Polar's total and one-per-customer limits. wovain also allows one promo grant per merchant per promo, enforced by a unique index, so two checkouts finished at once still credit once. The endpoint allows 5 attempts per merchant per 10 minutes, counted in Postgres so every instance sees the same count.

| Promo | Credits | Redemptions | Ends | Status |
| --- | --- | --- | --- | --- |
| `judges-2026` | 300 | 50 | 2026-12-16 | on: hackathon judges, shared only in Devpost's private testing box |
| `launch-2027` | 50 | 500 | 2027-03-31 | off: an example launch code for when paid plans open |

Cost: a 300-credit redemption (about 16 drops) costs wovain at most about $8.50 in provider calls (about $0.028 a credit when half the designs are redrawn). A $0 order takes no payment.

## Value metric: credits, sized to drops

A merchant pays for finished drops: researched ideas, approved designs, a paused campaign. Seats and API calls don't measure that. Credits do, and they map onto the steps wovain runs and pays for. The pricing skill's test ("as a customer uses more, do they get more value?") holds: more credits means more drops. Credits stay the unit, not drops, because a drop's cost varies: autopilot adds calls, and a capsule draws more art. The plan cards and the FAQ show credits as "about N drops", the unit a merchant thinks in.

### What a drop costs wovain (recomputed 2026-10-29)

Since #76, a design draws its art on **wovain's own fal key** while the `onboarding-wizard` flag is on (dev and next today; `platformFal` in `packages/api/src/flow/connections.ts`). Merchants need no fal connection there, so the art is wovain's cost, and the largest one.

| Step | What wovain pays for | Cost |
| --- | --- | --- |
| Research (one run) | Tavily for 3 themes: an advanced news search (2 Tavily credits), a marketplace search (1) and a listing extract (1), at $0.008 a Tavily credit. Qloo once. Nemotron writes the ideas. | about **$0.12** |
| Design | GPT Image 2.5 (`openai/gpt-image-2.5/flare/text-to-image`) at 2880 × 2880, quality high: about $0.10 on fal (the same pixel count as fal's 3840 × 2160 row, $0.10008). Nemotron's brief and judgment. | about **$0.11** |
| Assist (autopilot pick or review, ad copy) | One Nemotron call. | about **$0.005** |

A manual drop (research, three designs, ad copy) costs about **$0.45**. An autopilot drop (plus its pick and three reviews) costs about **$0.47**. A redraw after the judge says "revise" is not charged again (`packages/api/src/flow/designs.ts`), so a heavy user whose designs are redrawn half the time costs about **$0.62** a drop.

The old credit costs (research 3, design 2, assist 1, so 10 credits a drop) were set when the art ran on the merchant's fal. With the art on wovain, a credit cost about $0.047, not $0.02. Studio used in full kept only about 49% gross margin, and Label 39%.

### Credits per step

| Step     | Credits       | Cost per credit |
| -------- | ------------- | --------------- |
| Research | **5** (was 3) | about $0.023    |
| Design   | **4** (was 2) | about $0.028    |
| Assist   | 1             | about $0.005    |

A manual drop is **18 credits** and an autopilot drop is **22**, so a credit costs wovain about **$0.025** (up to $0.028 for heavy use). Credits are reserved before a step runs and come back if the step fails.

If merchants bring their own fal instead (the `onboarding-wizard` flag off, as in production today), design can go back to 2 credits, because the art is then the merchant's cost.

## Tiers

|  | Free | Studio (recommended) | Label |
| --- | --- | --- | --- |
| Price | $0 | **$29 / month** | **$79 / month** |
| Credits | **40 a month** (about 2 drops) | **300 a month** (about 16 drops, 13 on autopilot) | **1,000 a month** (about 55 drops, 45 on autopilot) |
| Price per credit |  | $0.097 | $0.079 |
| Autopilot | no, you approve every step | yes, up to 50 credits a day | yes, up to 150 credits a day |
| Unused credits | expire | expire | roll over |

There is also a **credit pack**: **100 credits for $15** (was $10). It is one time, never expires, and is for any plan.

### Margin per tier

Gross margin after provider calls and Polar's fee (4% + 40¢). Typical use is 6 autopilot drops a month on Studio and 20 on Label. Heavy use spends every credit on autopilot drops, with half the designs redrawn.

|  | Price | Typical cost | Typical margin | Heavy cost | Heavy margin |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | $0.45 (1 drop) |  | $1.38 (all 40 credits) |  |
| Studio | $29 | $4.39 | **85%** | $10.03 | **65%** |
| Label | $79 | $12.98 | **84%** | $31.80 | **60%** |
| Pack | $15 |  |  | $3.82 | **75%** |

Qloo's commercial price is unknown (the hackathon key is free). The table counts $0.01 a call. Even $0.10 a call moves heavy Studio margin by under 2 points.

### Why these numbers

- **Credit costs follow cost.** Every credit costs wovain about the same, about $0.025, whatever the step. Margin then no longer depends on which steps a merchant uses. The rest of the proposal depends on this change.
- **$29 is the anchor, and it stays.** It sits with what a print-on-demand seller already pays each month (checked 2026-10-29): Printify Premium $39, up from $29 in February 2026 [1]; Printful Growth $24.99 [2]; Fourthwall Pro $19 [3]; Kittl Pro about $15 and Expert about $30 [4]; Placeit $14.95 [5]; AI-merch apps from $29 (PromptInk) [6]. Each of those does one part: fulfilment discounts, an editor, mockups or art. wovain does the research, the art, the listing and the paused Meta campaign. The pricing skill's ~$10 and ~$100 buckets and its "avoid the $9 trap" rule point to the same place.
- **Studio keeps 300 credits, which is now about 16 drops, not 30.** The concern that 30 drops a month is more than a 1 to 5 person label uses was right. The cause was the credit cost, not the allowance. 16 drops (three or four a week) covers a small label's typical 4 to 8 drops with room for tests. A seller who tests more moves to Label.
- **Free goes to 40 credits (about 2 drops).** The step from Free to Studio was 12× (25 to 300 credits). At the new costs, 25 credits would finish one drop and nothing more. Two full drops reach the moment of value (a researched, drawn and priced drop), and the step to Studio becomes 7.5×. A Free user costs at most about $1.40 a month.
- **Label is 2.7× Studio's price for 3.3× its credits.** Good-Better-Best puts Best at 2 to 3× Better. Label's rate per credit is 19% lower, and it adds rollover and a higher daily autopilot cap.
- **The pack costs more per credit than any plan.** At $10 it was $0.10 a credit against Studio's $0.097, so it gave no reason to subscribe. At $15 ($0.15 a credit, 55% over Studio) it is a top-up for a busy month, or one more drop for a Free merchant. Studio is plainly the better buy for regular use. Polar's fixed 40¢ also takes a smaller share.
- **No plan between Free and Studio.** A $10 to $15 plan would sit in the "$9 trap" and split a small market. The pack covers the occasional extra drop.

### Tier fences

- **Autopilot** (Studio and Label): the feature a seller notices, it costs more per drop, and it is the riskier action. Keep it.
- **Daily autopilot cap** (`autopilotDailyCredits`): Free 25 (dev and next only, where Free has autopilot), Studio 50, Label 150. A run's estimate is 21 credits, so Studio runs up to 2 autopilot drops a day and Label up to 7.
- **Rollover** (Label): keep it, but rollover has no cap today (`packages/billing/src/mirror.ts`), so unused credits pile up without limit. Cap it at one month's credits before launch. That is a code change, not part of this config.
- **Not fences yet:** multiple brands (one brand profile per merchant today; a natural Label fence once it exists), Experimental drops and Store features. The last two are release flags rolling out to everyone, and store actions run on the merchant's Fourthwall at no cost to wovain. Don't sell what isn't built.
- **Annual billing** (2 months free) is left out for v1. Each interval is its own Polar product, so annual is one more catalog entry once monthly pricing is proven.

Sources: [1] [Printify help: Premium plan, February 2026](https://help.printify.com/hc/en-us/articles/42641734110225); [2] [PricingSaaS: Printful](https://pricingsaas.com/companies/printful); [3] [Fourthwall Pro overview](https://help.fourthwall.com/frequently-asked-questions/account-and-plans/fourthwall-pro-overview); [4] [Kittl help: credits](https://kittl.com/help/design/credits) and [Kittl pricing 2026](https://www.wearefounders.uk/kittl-pricing-2026-every-plan-explained/); [5] [Capterra: Placeit pricing](https://www.capterra.com/p/228818/Placeit/pricing/); [6] [PromptInk listing](https://pickyourapp.com/es/collections/finding-products-sourcing-options/products/promptink-ai-print-on-demand). Costs: [fal GPT Image 2.5 prices](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image), [Tavily API credits](https://docs.tavily.com/documentation/api-credits).

## Who pays which cost

| Cost | Who pays | Notes |
| --- | --- | --- |
| **fal** (artwork) | **wovain**, paid for with design credits, while `onboarding-wizard` is on (dev and next) | Otherwise the merchant's own fal connection (production today). Capsule drops (`packages/api/src/flow/drops.ts`) still draw on the merchant's fal while they charge design credits. Decide whether they move to wovain's key too. |
| **Meta** ads spend | Merchant, on their own ad account | Campaigns are created paused. |
| **Fourthwall** blanks and fees | Merchant, on their own shop | Fourthwall takes its base cost from each sale. |
| **Nebius / Nemotron** (brief, judge, autopilot, copy) | wovain, paid for with credits | It is cheap, and asking merchants for a key would add onboarding friction. |
| **Tavily** (research) | wovain, paid for with credits | About $0.10 a research run. |
| **Qloo** (taste graph) | wovain, paid for with credits | Today this uses the **hackathon** key. Check that its licence allows commercial resale before charging for it. Merchants can't bring their own. |
| Polar | wovain | 4% + 40¢ per transaction (merchant of record). |

## Environments

- **next** (`infra/next/Pulumi.next.yaml`) carries these numbers.
- **production** (`infra/Pulumi.prod.yaml`) is frozen until 2026-11-16 and keeps the old ones (Free 15, research 3, design 2, pack $10, no daily caps). Change it after 11-16, together with the `onboarding-wizard` rollout, because these credit costs assume the art runs on wovain's fal.
- `PRICING_RULES` (the price floor for the merchant's own products) is not about wovain's plans and doesn't change.

## Before production

1. Lock the numbers above.
2. Decide who pays for fal in production (wovain's key through `onboarding-wizard`, or the merchant's connection) and set production's credit costs to match.
3. Cap Label's rollover.
4. Register the business and set up Polar production: `POLAR_ENVIRONMENT=production`, a production token, and `pnpm polar:seed` with `POLAR_WEBHOOK_URL`.
