# Plan: Remove hand-rolled code from trend research and the Genkit telemetry filter

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/src/lib/tavily.ts`: SDK types, a search client instead of a `Search` function, no `plain()`.
- `apps/server/src/lib/trends.ts`: the rule ranker goes; relevance fallback; 1-based result numbers.
- `packages/shared/src/trends.ts`: one source schema, optional `angle` and `why`, `ranker: "nemotron" | "tavily"`.
- `apps/server/src/telemetry.ts`: `GenkitSpanFilter` replaces `RedactingSpanProcessor`.
- `apps/server/src/tools/research.ts`, `apps/server/src/playbooks/design.ts`: wording for the relevance fallback and source-only ideas.
- Tests: `test/unit/trends.test.ts`, `test/unit/telemetry.test.ts`, `test/integration/research-tools.test.ts`, `test/live/tavily.test.ts`, a fake Tavily reply in `test/helpers.ts`.
- Docs: `AGENTS.md`, `README.md`, `docs/spec.md`.

## Order of work

1. Failing test for the numbering bug: the first result goes to the model as `n: 1`, and a citation of 1 links it.
2. Fix the numbering.
3. Tavily types and client, then the relevance fallback, then the shared schema.
4. Telemetry filter and its two tests.
5. Docs, then every check.

## Risks

- Tests that matched the old option object exactly now see `searchDepth` and `timeout` too; they match on the fields they care about.
- `TavilySearchOptions` has an index signature, so a misspelt option still compiles. The options sit in two constants next to each other, and the unit tests check them.

## Tests that prove it

- Unit: numbering (fails first), relevance fallback order and count, model failure falls back to relevance, http/https filter and clipping, Genkit span dropped, other span kept.
- Integration: `research_trends` over MCP returns relevance-ranked ideas with the untrusted note.
- Checks: `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `build`.
