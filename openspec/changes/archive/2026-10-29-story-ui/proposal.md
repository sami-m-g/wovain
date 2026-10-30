# Proposal

Issues: https://github.com/sami-m-g/wovain/issues/199 (rail and Home), https://github.com/sami-m-g/wovain/issues/200 (drop page), https://github.com/sami-m-g/wovain/issues/201 (idea card)

## Why

The merchant UI should tell one story: Qloo tells you what will sell and who buys it, and wovain turns that into your product and a campaign. Today it does not. The rail has 8 items. A drop can start from 3 places. Two setup checklists count different things (1 of 6 and 0 of 5). Qloo appears only as bare numbers ("taste affinity 0.96"), never as a decision with its evidence. Internal tools sit in the merchant's path: the With and Without Qloo benchmark, Scan now and the header mic. The founder approved the critique and proposal on 2026-10-29. The Qloo hackathon judges and real merchants both need to see the story.

## What Changes

Behind a new `story-ui` flag, on in dev and next and off in production, in 3 pull requests:

1. **Rail and Home (#199).**
   - The rail has 4 items: Home, Drops, Store and Settings. New drop and Insights leave the rail; their URLs still work.
   - Home shows, in order:
     - the next action
     - what sells now (Qloo)
     - drops in progress
     - results for the last 28 days. Before the first sale, this area shows "Your first sale shows here" instead of being hidden.
   - The next action and the onboarding steps read the same facts. The Store holds the setup checklist. Brand is optional and is not a setup step.
   - Settings gathers connections, the optional brand, billing and the account.
   - Autopilot (page, rail item and scheduled scans) and the header mic are off in next by their flags (`autopilot-triggers` and `voice-input`). They stay on in development. A new `scan-now` flag controls Scan now. The code stays.
   - The With and Without Qloo panel (#169) leaves the merchant UI. The ablation and its report stay in `packages/core`.
2. **Drop page (#200).**
   - Each drop is one page, read top to bottom: why it sells, who buys and where, ideas, designs, product, campaign and results.
   - A "Decided by Qloo" marker with its evidence sits at the audience and the targeting.
3. **Idea card (#201).**
   - Every idea card has the same sections in the same order: what to make, why it sells, who buys and where, and competition.
   - A section without data says "Not available: <reason>" instead of vanishing.
   - Titles and concepts come from the ranking pipeline.

## Capabilities

### Modified Capabilities

- `app-ui`: the story rail, the story Home, one setup source of truth, the Settings hub, Decided by Qloo markers, the drop page and the fixed idea card

## Impact

- `packages/core`: `flag-registry.ts` (`story-ui`, `scan-now`; `autopilot-triggers` and `voice-input` development-only), with `infra/posthog/flags.json` regenerated
- `apps/web`:
  - the rail, the breadcrumb and the dashboard layout
  - the Home (`components/home`) and the Settings hub
  - `use-launch-facts.ts`, shared by the onboarding flow and the Home
  - messages in en, es and fr
  - the With and Without Qloo panel removed
- `apps/fumadocs`: the getting-started guide in en, es and fr
