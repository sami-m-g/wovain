# Plan: Genkit and Nemotron on Nebius Token Factory for wovain's own model calls

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/package.json`: add `genkit` 1.42.0 and `@genkit-ai/compat-oai` 1.42.0 (exact pins). Add `"test:live": "vitest run --project live"`.
- `package.json` (root): `"test:live": "pnpm --filter @wovain/server test:live"`.
- `pnpm-lock.yaml`: from `pnpm add`. `pnpm-workspace.yaml`: `allowBuilds` entries only if the install asks for new ones.
- `packages/shared/src/judge.ts` (new): `judgeRuleSchema`, `designBriefSchema`, `designJudgmentSchema`, `judgeResultSchema` and their types.
- `apps/server/src/lib/ai.ts` (new): `createAi(apiKey?)` (Genkit with the `nebius` plugin, Genkit's own OTel startup turned off) and `models.judge`.
- `apps/server/src/lib/design-judge.ts` (new): `ruleFacts`, `applyFacts` and `createDesignJudge`. (Changed in review: there's no Genkit flow, because a flow without zod 3 schemas is typed `any` and needed a second parse. `lib/ai.ts` gained a typed `generateObject` for the zod 4 to JSON Schema bridge. The model no longer sends `verdict`; code derives it from the checks. The title-length fact went away because the brief schema already caps the title.)
- `apps/server/src/telemetry.ts`: a `RedactingSpanProcessor` exports Genkit spans with an allowlist of attributes (name, type, path, state, root and failure flags, subtype), exception events without their attributes, and the status code without its message (added after the security review). Other spans pass through untouched.
- `apps/server/src/server.ts`: `createServer` takes `{ designJudge?, videoPricing? }` instead of more positional parameters.
- `apps/server/src/tools/judge.ts` (new): registers `judge_design`, with an optional judge passed in. (Planned for `tools/design.ts`. It moved to its own file because `oxlint.config.ts` caps file and function length at today's worst file, and `design.ts` is close to that cap.) `lib/design-judge.ts` also exports `designJudgeFor(apiKey)`, which `server.ts`, `http.ts` and the live test share.
- `apps/server/src/server.ts`, `apps/server/src/http.ts`: build the judge once per process and pass it to `registerDesignTools`.
- `apps/server/src/playbooks/design.ts`: the new "Check" step and its rule.
- `apps/server/src/env.ts`: `NEBIUS_API_KEY`'s comment only (the key is already optional there).
- `apps/server/vitest.config.ts`: a `live` project (`test/live/**/*.test.ts`), kept out of `unit` and `integration`.
- `apps/server/test/unit/design-judge.test.ts` (new): `ruleFacts` and `applyFacts` cases, plus the flow with `mockModel` (a valid reply, a reply that fails the schema, a model error).
- `apps/server/test/integration/design-tools.test.ts`: `judge_design` with no judge gives `{ configured: false }`, and with a `mockModel` judge gives a schema-valid judgment over MCP.
- `apps/server/test/live/nemotron.test.ts` (new): one brief judged by the real model, `describe.skipIf(!process.env.NEBIUS_API_KEY)`.
- `apps/server/test/helpers.ts`: pass an optional judge through to `createServer`.
- `README.md`: the "Nebius and Nemotron" section (model, the `judge_design` call, how to run it locally and with `pnpm test:live`, cost note), and the env table row for `NEBIUS_API_KEY` now says what uses it.
- `docs/spec.md`: Stack row "Agent framework" (Genkit 1.42.0 with `@genkit-ai/compat-oai`, used by the design judge); the tools table (`judge_design`); the file tree (`lib/` gains ai and design-judge, `test/live/`); External Services (Nebius Token Factory row with model and cost); the Decisions row "Genkit as the agent framework" (no longer "not used in the code yet"); the keys row (`NEBIUS_API_KEY` is used by `judge_design`).
- `docs/app-map.html`: the server box gains the Genkit layer and the Nebius arrow.
- `AGENTS.md`: one line in the run-the-server bullet: `judge_design` needs `NEBIUS_API_KEY`, and `pnpm test:live` hits Token Factory.

Not changed: `apphosting.yaml` (it lists `NEBIUS_API_KEY` once the secret has a value, a later step for the user), `infra/` (the secret exists since !29), `.env.example` (already has the key).

## Order of work

1. After approval, move the issue to `status::doing`.
2. `pnpm add --save-exact genkit@1.42.0 @genkit-ai/compat-oai@1.42.0 --filter @wovain/server`. Review install-script warnings and update `allowBuilds` if needed. Run `pnpm typecheck` so the zod 3 and zod 4 types are known to coexist.
3. `packages/shared/src/judge.ts`.
4. `lib/ai.ts` and `lib/design-judge.ts`, then the unit tests with `mockModel`. Run `pnpm test`.
5. `judge_design` in `tools/design.ts`, wiring in `server.ts`, `http.ts` and `test/helpers.ts`, then the integration tests. Run `pnpm test:integration`.
6. The playbook step, plus `playbooks.test.ts` if it snapshots the text.
7. The `live` vitest project and `test/live/nemotron.test.ts`. Run `pnpm test:live` and confirm it skips without the key.
8. README, `docs/spec.md`, `docs/app-map.html` and AGENTS.md, with the humanizer pass on the new prose.
9. Run every check: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test`, `pnpm test:integration`, `pnpm build`.
10. Run `/simplify`, the code-simplifier and the silent-failure-hunter, then write `verify.md`, push and open the MR (no Duo reviewer while credits are paused).

## Risks

- **Genkit becomes the one layer for model calls (approve).** Every later model call (#4's image judge, listing copy) goes through `lib/ai.ts`. It brings zod 3, express and an older OpenTelemetry SDK into the server's dependencies. That's a lot of weight for one call today. The alternative is the `openai` SDK directly, which `compat-oai` already depends on.
- **Two zod versions (approve).** Genkit's schema helpers are zod 3. wovain's schemas stay zod 4 and reach Genkit as JSON Schema, then the reply is parsed again with zod 4. Genkit's typed `output.schema` and flow `inputSchema` go unused. If Genkit moves to zod 4, this can switch to the typed form.
- **Version 1.42.0, not the latest (approve).** 1.43.0 is a day old, inside Renovate's 7-day window. Renovate will offer the bump.
- **The model id is unverified until a key exists.** `nvidia/nemotron-3-super-120b-a12b` comes from Nebius's announcement page. The first `pnpm test:live` run confirms it, and it's one constant to change.
- **Structured output on Nemotron.** If Token Factory rejects or ignores `json_schema` for this model, the live test fails on the zod parse. The fallback is `json_object` plus the schema in the prompt, a small change in `design-judge.ts`.
- **Telemetry.** If `disableGenkitOTelInitialization()` doesn't stop Genkit's NodeSDK, a second tracer provider would log a duplicate-registration warning at the first judge call. A unit test asserts that `trace.getTracerProvider()` is unchanged after a mocked run.
- **Playbook length.** One more step per design adds one model turn and a few seconds. The step is skippable and never blocks the widget.

## Tests that prove it

- Unit (`pnpm test`): `ruleFacts` fails print size, transparency, title length and color count at the right thresholds. `applyFacts` overrides a model that passes a failing rule and forces `revise`. The `judgeDesign` flow with `mockModel` returns a parsed judgment, turns a reply that breaks the schema into the user-safe error, and turns a model error into the same error. The tracer provider is untouched.
- Integration (`pnpm test:integration`): `judge_design` over the real MCP client answers `{ configured: false }` without a judge, and a judgment that passes `judgeResultSchema` with a mocked judge.
- Live (`pnpm test:live`, opt-in): one real Nemotron 3 Super call returns a judgment that parses. Skipped without `NEBIUS_API_KEY`.
- `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm build`.
