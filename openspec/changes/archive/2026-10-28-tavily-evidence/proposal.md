# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/62

## Why

Tavily already supplies the "why now" and the marketplace check on every idea, but it stops there. One failed search fails the whole research step, the margin score reads prices from search snippets, nothing checks whether a printed slogan is someone else's trademark, and the docs say research reads the past week when the code reads the past month. For the Tavily bonus and for real merchants, every claim wovain shows should carry the pages it came from, and an agent should refuse words it can't stand behind.

## What Changes

- Each Tavily search in trend research settles on its own. A failed search is logged at error level and the idea stands on the other search; only when every search fails does the step fail.
- Behind the `tavily-evidence` flag (on in development and next, off in production):
  - **Competitor prices.** Tavily Extract reads Redbubble, TeePublic and Etsy listing pages and feeds their median price to the margin score, handling `failed_results` by falling back to snippets.
  - **Research dossier.** A merchant can ask for a Tavily Research dossier on an idea: `output_schema` {why_now, saturation, price_band, risks, citations}, with the idea's and brand profile's Qloo taste data attached as a JSON file.
  - **Trademark guardrail.** Each phrase a design prints is searched with `exact_match` on trademark registers and marketplaces. A register match fails a new `trademark` design check, so the brief is rewritten once; an unchecked phrase also fails it. The merchant sees the citations.
  - **Citations in the UI**: idea cards show the competitor prices and dossier with numbered sources, and design cards show the trademark findings.
- Docs say "past month" where they said "past week", and describe the evidence layer.

## Capabilities

### Modified Capabilities

- `design-generation`: per-search failure isolation, competitor prices from listings, research dossiers and the trademark check.

## Impact

- `packages/core`: new `evidence.ts`; `trends.ts` (settled searches, Extract prices, the full Tavily client); `design.ts` (the `trademark` rule).
- `packages/api`: `flow/evidence.ts` and `ideas.dossier` / `ideas.startDossier` procedures; the design flow runs the trademark check.
- `apps/web`: citation, dossier and trademark UI on the wizard's idea and design cards; en, es and fr copy.
- No new tables or migrations: the dossier and prices are saved inside `idea.research`, and the trademark result inside `design.judgment` (both jsonb).
- Tavily credits: up to 5 Extract pages per theme, one search per printed phrase, and one Research `mini` task per dossier the merchant asks for.
