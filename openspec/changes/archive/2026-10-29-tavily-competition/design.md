# Design

## Context

Trend research (`packages/core/src/trends.ts`) saves ranked ideas per Qloo theme in `idea.research`. The `tavily-evidence` work added `competitorPrices` (Extract on listing pages) and the trademark check. The run's research step (`packages/api/src/flow/runs.ts`) is where autopilot picks ideas. Another workstream is changing `trends.ts`, so this change stays out of it.

## Goals / Non-Goals

**Goals:** a competition read per theme that the brief, the ad writer and autopilot act on; every point linked to its page; no silent failure.

**Non-Goals:** Meta Ad Library (Tavily can't read its pages); a model deciding saturation or gaps; crawling or mapping whole stores.

## Decisions

- **Read in the research step, saved on its own column.** The read runs after `researchIdeas` saves the ideas and before autopilot picks, in parallel per idea, and is saved on a new nullable `idea.competition` jsonb column. A separate column keeps `TrendIdea` (in `trends.ts`) unchanged. A saved read is reused when the step retries.
- **Search, filter in code, then extract** (tavily-best-practices). One basic search (20 results, `include_domains` on the marketplaces) is filtered to near-identical listings: on a marketplace domain, relevance score of at least 0.5, and every theme word in the title or snippet. The count out of 20 decides the level: under 4 low, 4 to 7 medium, 8 or more high. High is saturated. Map isn't used: the search already finds the listing pages, and mapping stores would spend credits without adding listings for this theme.
- **Extract with a query.** The top 5 listings are extracted with a `query` for title, tagline, style, price and review complaints and 3 chunks per page, so only the relevant text reaches the model. `competitorPrices` reads the same listings for the price.
- **The model lists, code decides.** `competition_summary` (default job in the model router) returns `{points: [{kind, text, sourceUrl}]}` validated by Zod; code keeps only points whose `sourceUrl` is a page it read. Gaps are computed in code: the theme's Qloo affinity cues that the listings' text doesn't contain.
- **Agents.** `draftBrief` takes `{avoidLooks, aimAt}` and a rule to avoid those looks and aim at the gaps. `writeAdCopy` takes `{angles (with source), gaps}` and a counter-positioning rule. The grounding guard compares buyer-facing text with the prompt, and the angles are in the prompt, so a number or claim from a cited competitor line passes and anything else is still sent back.
- **Autopilot.** Saturated ideas are removed before `pickIdea`, and `skipped` (the reason) is saved on the idea's competition. If every idea is saturated, autopilot draws nothing.
- **Trace.** `nemotron.ts` exposes the current decision trace, so the search, the extract, the citation filter and the gaps are recorded next to the `competition_summary` agent call, with their sources. The model trace shows a step's `note`.
- **Failures.** A failed search marks the read `unknown` (with the error) and the card offers "check again" (`ideas.competition`). A failed extract, price read or summary keeps the read and lists the failed step. Each failure is logged through evlog at error level (code `COMPETITION_READ_FAILED`), also when the run has no request logger.

## Risks / Trade-offs

- The level counts a 20-result sample, not the whole market; the card says "N near-identical listings in 20 results".
- Word matching misses paraphrased listings and can count a loose match; the relevance score filter limits the second.
