# wovain pricing proposal

**Status: proposal (2026-10-26).** Every number below is for you to lock in. They live in one file, `packages/billing/src/plans.ts`. To change a number, edit that file and run `pnpm polar:seed`.

## Launch: Free only (decided 2026-10-26)

Only Free is live, so every merchant is on Free. This keeps wovain within the Qloo hackathon rules: Qloo is never part of a paid product.

- `/pricing` shows every tier. Studio, Label and the credit pack are marked **Coming soon**. They have no checkout button. Instead, "Notify me" sends a `paid_plan_interest` PostHog event, with no email form.
- The server flag `billing-paid-plans` is **off** by default. While it is off, `billing.checkout` refuses with `PAID_PLANS_NOT_AVAILABLE`, so there are no plan changes and no pack purchases. The flag is read through `packages/billing/src/flags.ts`, so it can move onto the typed flag registry from feat/progressive-delivery.
- When a merchant runs out of credits, the upgrade screens say "More credits are coming soon" and that Free's credits refresh every month. Nothing is sold.
- Free runs on Polar (sandbox for now) and grants its 15 credits a month.
- `pnpm polar:seed` creates the paid products **archived**, so nobody can buy them. To launch them: get Qloo's written permission or a commercial licence, run `POLAR_PAID_PLANS=on pnpm polar:seed`, then turn `billing-paid-plans` on.

## Value metric: credits, sized to drops

A merchant pays for finished drops: researched ideas, approved designs, a paused campaign. Seats and API calls don't measure that. Credits do, and they map cleanly onto the steps wovain runs and pays for:

| Step | Credits | What wovain pays for |
| --- | --- | --- |
| Research (one run) | 3 | Qloo once, Tavily for each theme |
| Design | 2 | Nemotron brief and judge (the art runs on the merchant's fal) |
| Assist (autopilot pick or review, ad copy) | 1 | one Nemotron call |

A manual drop (research, one design, ad copy) is **6 credits**. An autopilot drop is **8 credits**. wovain's cost is at most about $0.02 a credit (Qloo about $0.01, Tavily about $0.008 a call, Nemotron about $0.005 a call). A credit sells for $0.08 to $0.10, so gross margin is about 75 to 80% before Polar's fee (4% + 40¢).

Credits are reserved before a step runs and come back if the step fails.

## Tiers

|  | Free | Studio (recommended) | Label |
| --- | --- | --- | --- |
| Price | $0 | **$29 / month** | **$79 / month** |
| Credits | **15 a month** (about 2 drops) | 300 a month (about 40 drops) | 1,000 a month (about 125 drops) |
| Autopilot | no, you approve every step | yes | yes |
| Unused credits | expire | expire | roll over |

There is also a **credit pack**: 100 credits for $10, one time, never expires. It is for any plan.

Why these numbers:

- **$29 is the anchor.** It sits with the tools a POD seller already pays for: Printify Premium is $39 a month (it was $29 until February 2026), Kittl Pro is about $15 and Expert about $30, Placeit is $14.95, and AI-merch apps cost $29 to $79 (PromptInk Starter $29, Unlimited $79; Autopictura $49). Unlike those tools, wovain also writes the ads and builds the campaign. The pricing skill's ~$10 / ~$100 buckets and its "avoid the $9 trap" rule point to the same place.
- **Free stays minimal on purpose.** It is enough to see one or two real drops, and it costs wovain under $0.30 a month per user. Polar gives the credits through a free monthly subscription, so it is all code (`ensureFreePlan`). If you would rather make it a one-time credit, Free can become a one-time grant later.
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
