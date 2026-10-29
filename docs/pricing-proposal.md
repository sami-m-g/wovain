# wovain pricing proposal

**Status: proposal (2026-10-26).** Every number below is for you to lock in. They live in one file, `packages/billing/src/plans.ts`. To change a number, edit that file and run `pnpm polar:seed`.

## Launch: Free only (decided 2026-10-26)

Only Free is live, so every merchant is on Free. This keeps wovain within the Qloo hackathon rules: Qloo is never part of a paid product.

- `/pricing` shows every tier. Studio, Label and the credit pack are marked **Coming soon**. They have no checkout button. Instead, "Notify me" sends a `paid_plan_interest` PostHog event, with no email form.
- The server flag `billing-paid-plans` is **off** by default. While it is off, `billing.checkout` refuses with `PAID_PLANS_NOT_AVAILABLE`, so there are no plan changes and no pack purchases. The flag is read through `packages/billing/src/flags.ts`, so it can move onto the typed flag registry from feat/progressive-delivery.
- When a merchant runs out of credits, the upgrade screens say "More credits are coming soon" and that Free's credits refresh every month. Nothing is sold.
- Free runs on Polar (sandbox for now) and grants its 25 credits a month.
- `pnpm polar:seed` creates the paid products **archived**, so nobody can buy them. To launch them: get Qloo's written permission or a commercial licence, run `POLAR_PAID_PLANS=on pnpm polar:seed`, then turn `billing-paid-plans` on.

## Promo codes for credits (2026-10-26)

Promo codes give free credits while only Free is live, and later they can run launch offers. They go through Polar's normal checkout, so there is no manual top-up: credits still come only from Polar's webhooks.

- **Defined in code.** `packages/billing/src/promos.ts` lists each promo: an id, the credits, the total redemptions, the end date, whether it is on, and who it is for. `pnpm polar:seed` makes each one a private, one-time credit pack product in Polar (its credits at the pack's rate, $10 per 100, so 300 credits list at $30). It also makes a 100%-off discount restricted to that product, with Polar's total and per-customer limits and the end date. An off promo's product is archived and its discount deleted.
- **No code in the repo.** The repository is public, so the seed generates a random 16-character code for each promo (80 bits) the first time it runs. It stores the code only in Polar and in Secret Manager (`polar-promo-<id>`) and never prints it. Read a code with `gcloud secrets versions access latest --secret=polar-promo-<id>` or in the Polar dashboard under Discounts. To choose a code instead, set the masked CI variable `POLAR_PROMO_CODE_<ID>`.
- **Redeeming.** Billing > Redeem a code calls `billing.redeem`. The server finds the code's discount in Polar, checks it, then opens a checkout with it applied. A $0 checkout needs no payment form, so the server confirms it and the merchant never leaves wovain. The webhook grants the credits as a pack grant (they never expire), notes `promo <id>` in the ledger, and sends `promo_redeemed` (the promo's id as `code`, the credits and the surface) to PostHog.
- **While paid plans are off,** only codes that make the checkout $0 are accepted. The server checks both the discount's terms and Polar's own `is_payment_required`. Otherwise it answers `PROMO_NOT_FREE`. The other typed errors are `PROMO_INVALID`, `PROMO_EXPIRED`, `PROMO_USED_UP`, `PROMO_ALREADY_REDEEMED` and `TOO_MANY_REQUESTS`.
- **Abuse limits.** Each code has Polar's total and one-per-customer limits. wovain also allows one promo grant per merchant per promo, enforced by a unique index, so two checkouts finished at once still credit once. The endpoint allows 5 attempts per merchant per 10 minutes, counted in Postgres so every instance sees the same count.

| Promo | Credits | Redemptions | Ends | Status |
| --- | --- | --- | --- | --- |
| `judges-2026` | 300 | 50 | 2026-12-16 | on: hackathon judges, shared only in Devpost's private testing box |
| `launch-2027` | 50 | 500 | 2027-03-31 | off: an example launch code for when paid plans open |

Cost: a 300-credit redemption costs wovain at most about $6 in provider calls (about $0.02 a credit). A $0 order takes no payment.

## Value metric: credits, sized to drops

A merchant pays for finished drops: researched ideas, approved designs, a paused campaign. Seats and API calls don't measure that. Credits do, and they map cleanly onto the steps wovain runs and pays for:

| Step | Credits | What wovain pays for |
| --- | --- | --- |
| Research (one run) | 3 | Qloo once, Tavily for each theme |
| Design | 2 | Nemotron brief and judge (the art runs on the merchant's fal) |
| Assist (autopilot pick or review, ad copy) | 1 | one Nemotron call |

A manual drop (research, three designs, ad copy for one approved design) is **10 credits**. An autopilot drop (plus its pick and a review per design) is **14 credits**. wovain's cost is at most about $0.02 a credit (Qloo about $0.01, Tavily about $0.008 a call, Nemotron about $0.005 a call). A credit sells for $0.08 to $0.10, so gross margin is about 75 to 80% before Polar's fee (4% + 40¢).

Credits are reserved before a step runs and come back if the step fails.

## Tiers

|  | Free | Studio (recommended) | Label |
| --- | --- | --- | --- |
| Price | $0 | **$29 / month** | **$79 / month** |
| Credits | **25 a month** (about 2 drops) | 300 a month (about 30 drops) | 1,000 a month (about 100 drops) |
| Autopilot | no, you approve every step | yes | yes |
| Unused credits | expire | expire | roll over |

There is also a **credit pack**: 100 credits for $10, one time, never expires. It is for any plan.

Why these numbers:

- **$29 is the anchor.** It sits with the tools a POD seller already pays for: Printify Premium is $39 a month (it was $29 until February 2026), Kittl Pro is about $15 and Expert about $30, Placeit is $14.95, and AI-merch apps cost $29 to $79 (PromptInk Starter $29, Unlimited $79; Autopictura $49). Unlike those tools, wovain also writes the ads and builds the campaign. The pricing skill's ~$10 / ~$100 buckets and its "avoid the $9 trap" rule point to the same place.
- **Free stays minimal on purpose.** It is enough to see one or two real drops, and it costs wovain under $0.50 a month per user. Polar gives the credits through a free monthly subscription, so it is all code (`ensureFreePlan`). If you would rather make it a one-time credit, Free can become a one-time grant later.
- **Autopilot is the paid line.** It is the feature a seller notices, it costs more per drop, and it is the riskier action, so it belongs on a paid plan.
- Annual billing (2 months free) is left out for v1. Each interval is its own Polar product, so annual is one more entry in `plans.ts` once monthly pricing is proven.

## Who pays which cost

| Cost | Who pays | Notes |
| --- | --- | --- |
| **fal** (artwork) | **Merchant**, on their own fal key or account | Per your decision. **Not built yet:** today the app still uses wovain's `FAL_KEY`. A sealed fal API-key connection must ship before billing goes live, or the pricing page copy is wrong. |
| **Meta** ads spend | Merchant, on their own ad account | Campaigns are created paused. |
| **Fourthwall** blanks and fees | Merchant, on their own shop | Fourthwall takes its base cost from each sale. |
| **Nebius / Nemotron** (brief, judge, autopilot, copy) | wovain, paid for with credits | Keep this on wovain. It is the product's own work, it is cheap, and asking merchants for a key would add onboarding friction. A bring-your-own key could be a Label option later. |
| **Tavily** (research) | wovain, paid for with credits | Keep. Small cost per run. |
| **Qloo** (taste graph) | wovain, paid for with credits | Today this uses the **hackathon** key. Check that its licence allows commercial resale before charging for it. Merchants can't bring their own. |
| Polar | wovain | 4% + 40¢ per transaction (merchant of record). |

## Before production

1. Lock the numbers above.
2. Ship the fal bring-your-own-key connection.
3. Register the business and set up Polar production: `POLAR_ENVIRONMENT=production`, a production token, and `pnpm polar:seed` with `POLAR_WEBHOOK_URL`.
