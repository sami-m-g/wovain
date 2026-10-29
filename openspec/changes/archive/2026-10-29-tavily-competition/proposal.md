# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/106

## Why

wovain tells a designer why a theme is timely, but not how crowded it already is or how the shirts already on sale are pitched. Without that, the brief can draw the same retro ghost every marketplace sells, the ad writer can repeat the competitors' hooks, and autopilot can spend a design on a theme with dozens of near-identical listings. For the Tavily prize the read must drive decisions in the run, not only sit on a card.

## What Changes

Behind a new `tavily-competition` flag (on in development and next, off in production), each Qloo theme in a run gets a competition read before anyone picks an idea:

- **Saturation.** One Tavily search on the print-on-demand marketplaces (Redbubble, TeePublic, Etsy, Amazon, Shopify stores and others), post-filtered in code to near-identical listings, gives a count, a level (low, medium, high) and a cited sample.
- **How competitors sell.** Tavily Extract on the top listings and the existing `competitorPrices` feed a Nemotron summarizer (`competition_summary`, through the model router) that returns Zod-checked titles, hooks, claims, prices, looks and review complaints, each with its page. A point citing a page wovain didn't read is dropped.
- **Gaps.** The theme's Qloo affinity cues that no listing mentions.
- **Used in code and agents.** The design brief gets the looks to avoid and the gaps to aim at. The ad writer gets the competitor angles with their pages and writes counter-positioned copy; the grounding guard accepts facts from those lines because they are in its prompt. Autopilot skips a saturated theme and stores why on the idea.
- **UI.** A "Competition" panel on the idea card and with a campaign's ads, with sources; a failed read shows "competition unknown" and a "check again" button.
- **Trace and errors.** Each step is in the run's decision trace (/dashboard/models). Every failure is logged at error level; a failed search marks the idea "competition unknown", never dropped silently.
- Docs: the Tavily integration page describes the read and says Meta Ad Library pages can't be read by Tavily.

This replaces, for now, the ad claim check in #84 (left open).

## Capabilities

### New Capabilities

- `competitive-landscape`: the per-theme competition read and how the brief, the ad writer and autopilot use it.

## Impact

- `packages/core`: new `competition.ts`; the `competition_summary` agent; `ads.ts` and `design.ts` take the competition; `nemotron.ts` exposes the current decision trace; helpers exported from `evidence.ts`; the flag in `flag-registry.ts` (and `infra/posthog/flags.json`, generated).
- `packages/db`: a nullable `idea.competition` jsonb column and its migration.
- `packages/api`: `flow/competition.ts`; the run's research step reads competition and autopilot skips saturated themes; `ideas.competition` and `campaigns.competition` procedures; the model trace shows a step's note.
- `apps/web`: the Competition panel on idea cards and campaign cards; en, es and fr copy.
- `trends.ts` is not changed.
- Tavily credits per theme: one basic search and up to two Extract calls of 5 pages; one Nemotron call.
