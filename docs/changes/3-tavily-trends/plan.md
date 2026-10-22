# Plan: trend research with Tavily

Spec: [spec.md](spec.md)

## Files that change

- `infra/Pulumi.prod.yaml`: the encrypted `wovain:tavily-api-key` value (in the plan commit, so the branch carries it).
- `apphosting.yaml`: `TAVILY_API_KEY` from secret `tavily-api-key`; the comment drops it from the "listed once they have values" list.
- `apps/server/package.json`, `pnpm-lock.yaml`: `@tavily/core` 0.7.14, exact pin.
- `packages/shared/src/trends.ts` (new) and the `./trends` export in `packages/shared/package.json`.
- `apps/server/src/lib/tavily.ts` (new): the key-gated `Search` over the SDK.
- `apps/server/src/lib/trends.ts` (new): the rule ranker, the Nemotron ranker with its fallback, and the trademark screen.
- `apps/server/src/lib/ai.ts`: `models.trends`.
- `apps/server/src/tools/research.ts` (new): `research_trends` and `screen_trademark`.
- `apps/server/src/server.ts`, `apps/server/src/http.ts`, `apps/server/test/helpers.ts`: pass the trend research through the deps object.
- `apps/server/src/env.ts`: the `TAVILY_API_KEY` comment says which tools use it.
- `apps/server/src/playbooks/design.ts`: the "No idea yet" section and the trademark step under "Approve design dN".
- `apps/server/test/unit/trends.test.ts` (new):
  - the rule ranker: grouping, recency, missing dates, too few results;
  - the Nemotron ranker with `mockModel`: number-to-URL mapping, invented numbers dropped, fallback on a model error;
  - the input bounds.
- `apps/server/test/integration/research-tools.test.ts` (new): both tools over the MCP client, with no key, with a fake search, and on a search error (user-safe message, no upstream text).
- `apps/server/test/live/tavily.test.ts` (new): one real `research_trends` run, skipped without `TAVILY_API_KEY`.
- `README.md`: env table row for `TAVILY_API_KEY` (what uses it) and a short "Tavily" note on cost and `pnpm test:live`.
- `docs/spec.md`: tools table, file tree, an External Services row for Tavily (calls and cost), the keys row.
- `docs/app-map.html`: a Tavily arrow from the server.
- `AGENTS.md`: the run-the-server bullet names `TAVILY_API_KEY` for `research_trends`.

Changed in review:

- `server.ts` gained `createDeps(env)`, which builds one Genkit instance for both `judge_design` and `research_trends`, the trend research and the price cache once per process. `http.ts` and the test helper use it, and `createServer` takes those deps as they are. `designJudgeFor` and `trendResearchFor` now take the Genkit instance instead of a key.
- `lib/tool-result.ts` gained `notConfigured`, `logErrorClass` and `userSafe`. `tools/judge.ts` uses them too.
- `test/helpers.ts` gained `mockAi`, and `connectClient` takes a deps object.
- Security review: search results are marked untrusted in the ranking prompt (`untrustedResults`), the system prompt, the tool results (`note`), the tool descriptions and the playbook. Only http and https links pass, both in `toHits` and in the shared schemas. Titles are stripped of markup and clipped, and snippets are clipped.

Not changed: `infra/index.ts` (it already creates the secret version only when a value exists), `.env.example` (already lists the key).

## Order of work

1. After approval, move the issue to `status::doing`.
2. `pnpm add --save-exact @tavily/core@0.7.14 --filter @wovain/server`; check for install-script prompts and `allowBuilds`.
3. Shared schemas, then `lib/tavily.ts` and `lib/trends.ts` with unit tests. Run `pnpm test`.
4. `tools/research.ts`, wiring and integration tests. Run `pnpm test:integration`.
5. Playbook text, plus `playbooks.test.ts` if it checks the text.
6. Live test. Run `pnpm test:live` once with the key piped in from `pulumi config get tavily-api-key --cwd infra -s prod` (never printed). That's one run for 2 credits ($0.016), plus 1 credit if the trademark screen is in the live test.
7. `apphosting.yaml`, README, `docs/spec.md`, `docs/app-map.html`, AGENTS.md, then the humanizer pass on new prose.
8. Every check: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test`, `pnpm test:integration`, `pnpm build`.
9. `/simplify`, the code-simplifier and silent-failure-hunter, then `verify.md`. Push and open the MR with no Duo reviewer.

## Risks

- **Paid calls (approve).** Each `research_trends` costs 2 Tavily credits ($0.016 pay-as-you-go), and each `screen_trademark` costs 1 ($0.008). The free tier is 1,000 credits a month. Inputs are bounded and searches stay basic-depth. There's no rate limit beyond sign-in and the allowlist.
- **Production key (approve).** Listing `TAVILY_API_KEY` in `apphosting.yaml` makes the deployed server call Tavily as soon as the MR merges and the next `pulumi up` writes the secret version. App Hosting fails the build on a secret with no version, but `deploy:production` needs `infra:production` (`.gitlab/ci/deploy.yml`), so on `main` the version is written before the deploy.
- **Trademark screen included (approve).** It's small: one function, one tool, one playbook line. It's a web search, not a registry lookup, and says so. The alternative is to leave it for #4.
- **Rule-ranker quality.** News-title keywords can be noisy. Unit tests pin the behavior. Ideas always carry real links, so the merchant can judge.
- **Nemotron citing results that don't exist.** Code maps only valid numbers. An idea left with no source is dropped. If none remain, the rule ranker runs.
- **SDK error messages carry response bodies.** Only the error class is logged. A test asserts that the upstream text doesn't reach the tool result.

## Tests that prove it

- Unit: the rule ranker orders by `sources × recency` and returns 3 to 5 ideas with valid URLs. The Nemotron ranker maps citations, drops invented ones, and falls back on error. The schemas reject oversized input. `createSearch()` without a key is `undefined`.
- Integration: `research_trends` and `screen_trademark` answer `{ configured: false }` without a key and schema-valid results with a fake search. A search error becomes the user-safe message.
- Live (opt-in): one real research run returns 3 to 5 ideas whose source URLs are http(s).
- `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm build`.
