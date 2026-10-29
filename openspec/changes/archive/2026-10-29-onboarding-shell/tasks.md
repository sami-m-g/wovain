# Tasks

Issue #171.

## 1. Shell

- [x] 1.1 `LaunchShell` replaces the onboarding wizard at `/dashboard/onboarding`: steps signed in, what to sell, store setup, Meta and guardrails, design approval, ads, campaign page; state in the URL (`?step`, `?brief`, `?run`)
- [x] 1.2 Step state derived in `launch-steps.ts` from `onboarding.status`, `store.setup` and `runs.get` (polled until the first campaign)
- [x] 1.3 Timer from sign-up toward 10 minutes, stopped at the first campaign
- [x] 1.4 Checklist from the shadcn-studio `onboarding-feed-01` block, adapted to data
- [x] 1.5 driver.js highlight of each step's next action, once per browser
- [x] 1.7 Meta step mounts the Meta setup cards (`<MetaSetup />`, #182) above the autonomy level and spend caps
- [x] 1.6 "Here's your campaign" at `/dashboard/campaign?run=`: products, store link, ads with controls, spend caps, journey KPIs; it finishes onboarding

## 2. Content

- [x] 2.1 `Launch` messages in en, fr and es
- [x] 2.2 Docs Getting started (en, fr, es) around the one flow
- [x] 2.3 Landing page "how it works" around the one 10-minute flow (en, fr, es)

## 3. Tests

- [x] 3.1 Step progress, timer and checklist (`apps/web/test/launch.test.tsx`)
- [x] 3.2 Browser check on a local dev server: sign-up lands in the flow, timer, checklist, highlights, store and Meta steps (Meta setup cards), landing section
