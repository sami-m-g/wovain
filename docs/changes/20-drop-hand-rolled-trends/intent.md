# Intent: Remove hand-rolled code from trend research and the Genkit telemetry filter

Issue: #20

## Problem

> Remove hand-rolled code from trend research and the Genkit telemetry filter.

A review of the Genkit and Tavily code found helpers that redo work the installed libraries already do:

- `apps/server/src/lib/trends.ts` ranks results without a model through a keyword ranker of its own (`rankByRules`, `recency`, `keywordIndex`, `bestGroup`, a stop-word list). Tavily already scores each result for relevance (`score`).
- `apps/server/src/lib/tavily.ts` copies the SDK's result and option types, and strips markup from titles with a regex (`plain()`).
- `packages/shared/src/trends.ts` declares the source shape twice.
- `apps/server/src/telemetry.ts` redacts Genkit spans through a `Proxy` (`RedactingSpanProcessor`). Dropping the Genkit tracer's spans does the same job with less code.
- Bug: the ranking prompt tells Nemotron the results are numbered 1 to 5, but they're numbered from 0, so a citation of 1 links the second result.

## Desired outcome

- Without Nemotron, or when it fails, research returns the top N Tavily results by relevance, one source per idea.
- `tavily.ts` uses the SDK's types; the test fake is `Pick<TavilyClient, "search">`.
- The shared schema declares each shape once.
- Telemetry drops spans whose instrumentation scope is `genkit-tracer`.
- The prompt and the result numbers agree, with a test.

## Constraints

- Keep every security behavior: the untrusted-data notes in the tool result and the playbook, http and https links only, bounded inputs, nothing logged.
- Keep the Nemotron ranking path for now.

## Open questions

None. Whether to drop the Nemotron path is a separate decision.
