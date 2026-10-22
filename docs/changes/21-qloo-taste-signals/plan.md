# Plan: Qloo taste signals drive trend research and Meta targeting

Spec: [spec.md](spec.md)

## Files that change

- `packages/shared/src/trends.ts`: `adCounts`, idea fields (`theme`, `taste`, `moment`, `tags`, `competitors`, `score`, `signals`), `qloo` status, audience schemas, `ranked` and `isQlooTag`.
- `apps/server/src/lib/qloo.ts` (new): the Qloo client on `fetchJson`, `tasteOf`, `audienceOf`.
- `apps/server/src/lib/taste.ts` (new): the Qloo path, `scoreIdea`, the writing prompt.
- `apps/server/src/lib/trends.ts`: picks the Qloo path or the news path; `apps/server/src/lib/tavily.ts` takes `UNTRUSTED` and `sourceOf`.
- `apps/server/src/tools/research.ts`: `adCounts` on `research_trends`, new `suggest_audience`.
- `apps/server/src/server.ts`, `apps/server/src/env.ts`: wire `QLOO_API_KEY`.
- `apps/server/src/playbooks/design.ts`, `campaign.ts`: the Ad Library step and the audience suggestion.
- Tests: `test/unit/taste.test.ts` (new), `test/helpers.ts` (`fakeQloo`), `test/unit/trends.test.ts`, `test/integration/research-tools.test.ts`, `test/live/qloo.test.ts` (new).
- Docs: `docs/spec.md`, `README.md`, `AGENTS.md`, `docs/app-map.html`, `apphosting.yaml` comment.

## Order of work

1. Shared schemas.
2. `qloo.ts` and its unit tests (fetch stubbed).
3. The Qloo path in `trends.ts` and its unit tests (fake Qloo, fake Tavily, mock Genkit).
4. Tools, wiring, integration tests.
5. Playbooks and docs; live test.
6. Checks, review agents, `verify.md`, MR.

## Risks

- Qloo's real field names differ from the documented and harness ones: lenient schemas, and the live test shows it once the key arrives.
- `apphosting.yaml` can't list `qloo-api-key` until it has a value (App Hosting won't build with an empty secret), so production stays on the non-Qloo path until the key is set.
- More Tavily credits per research (6 instead of 2).

## Tests that prove it

- Unit: request URLs, header and params; lenient parsing; the score formula; the fallbacks (`not_configured`, `no_match`, `failed`); a trending failure only drops velocity; IP names replaced; Nemotron can't change ranks; nothing about the seed is logged.
- Integration: `suggest_audience` without a key; `research_trends` with a fake Qloo over MCP.
- Live (opt-in): one real Qloo taste lookup and audience, skipped without `QLOO_API_KEY`.
- Checks: `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `build`.
