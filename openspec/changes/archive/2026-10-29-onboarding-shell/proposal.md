# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/171

## Why

The north star is sign-in to a running campaign in 10 minutes, all inside wovain. Today a new merchant meets three separate places: the onboarding wizard (connect, brand, autonomy), the new-drop flow (brief, ideas, designs, products, campaign) and the store page's setup checklist. Nothing shows how far along they are or how long it is taking, and nothing gathers the result in one place.

## What Changes

- The onboarding wizard becomes one guided flow with these steps in order: signed in, what to sell, store setup, Meta and guardrails, design approval, ads, and "Here's your campaign".
- A running timer counts from sign-up toward 10 minutes and stops when the first campaign is created.
- A checklist (the shadcn-studio `onboarding-feed-01` block, adapted to data) shows every step with its state. Signed in is already ticked. Each open step has one primary action.
- driver.js highlights each step's next action once, the first time the step opens. The highlight can be dismissed and does not repeat.
- What to sell uses the drop directions (#140): picking one fills the brief. An optional disclosure sets the brand, so the directions fit it.
- Store setup mounts the Store setup cards (#156). Meta and guardrails holds the Meta connection and the autonomy level and spend caps.
- Design approval and ads link into the drop flow at the right step. The run they started is polled, so each card ticks off when the merchant comes back.
- "Here's your campaign" (`/dashboard/campaign`) puts the run's products, the store link, the ads with their controls, the spend caps and the live KPIs (the journey milestones from #147) on one page.
- The docs' Getting started and the landing page describe the one 10-minute flow.

## Capabilities

### Modified Capabilities

- `onboarding`: the wizard is the one guided flow to a running campaign, with a timer, a checklist and a campaign page.

## Impact

- `apps/web`: `components/onboarding/*`, `app/[locale]/(app)/dashboard/{onboarding,campaign}`, messages (en/fr/es), the landing page. `onboarding-wizard.tsx` is replaced.
- New dependency: `driver.js` (MIT) in the pnpm catalog.
- No API or schema change: the flow reads `onboarding.status`, `runs.directions`, `runs.start`, `runs.get`, `store.setup`, `autonomy.get` and `insights.overview`.
