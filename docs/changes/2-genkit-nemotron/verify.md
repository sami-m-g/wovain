# Verify: Genkit and Nemotron on Nebius Token Factory for wovain's own model calls

## Tests added

- `apps/server/test/unit/design-judge.test.ts`:
  - Genkit doesn't register a second tracer provider (`setGlobalTracerProvider` is never called).
  - The code-decided rules (print size, transparency, color count) pass and fail at their thresholds.
  - A code failure overrides the model's pass and forces `revise`. A model fail stands where code passes, and the verdict follows the checks.
  - With `mockModel`, the judge sends JSON output with a schema, includes the brief, and parses the reply.
  - A reply that breaks the schema throws, and so does a model error.
  - `createAi()` without a key gives no Genkit instance.
  - The brief schema rejects an oversized idea, more than 20 colors, an over-long placement, blank name or title.
- `apps/server/test/unit/telemetry.test.ts`: real Genkit calls with a mock model, traced through `RedactingSpanProcessor` into an in-memory exporter.
  - On success, Genkit spans arrive with a valid span context but without `genkit:input` or `genkit:output`. The brief and the reply appear nowhere in their attributes, events or status.
  - On a model error whose message echoes the brief, the failed Genkit spans keep the ERROR code and their exception events. The events carry no attributes, the status has no message, and the brief text appears nowhere.
  - A span that isn't Genkit's (`mcp.request`) passes through unchanged.
  - Without the processor, the first two tests fail.
- `apps/server/test/integration/judge-tools.test.ts`: `judge_design` over the real MCP client.
  - Without a judge it answers `{ configured: false }` and names `NEBIUS_API_KEY`.
  - With a mocked judge it returns a judgment that passes `judgeResultSchema` with 6 checks.
  - A model failure becomes the user-safe error, with none of the upstream message.
- `apps/server/test/live/nemotron.test.ts`: one real Nemotron 3 Super call, opt-in through `pnpm test:live`. It's skipped without `NEBIUS_API_KEY`, which is the state today.

## Checks run

All pass on the final tree:

| Command                 | Result                     |
| ----------------------- | -------------------------- |
| `pnpm check`            | clean                      |
| `pnpm typecheck`        | clean                      |
| `pnpm knip`             | clean                      |
| `pnpm arch`             | no violations (97 modules) |
| `pnpm dupes`            | 0 clones                   |
| `pnpm test`             | 77 passed (10 files)       |
| `pnpm test:integration` | 44 passed (8 files)        |
| `pnpm test:live`        | 1 skipped (no key yet)     |
| `pnpm build`            | ok                         |

The modules also load under plain Node (`node` on `src/lib/design-judge.ts`), which is how App Hosting runs them.

## Review findings

`/simplify` ran four reviewers.

- **Reuse:**
  - The print-size check repeated `printQuality`, so it now calls it.
  - `TITLE_MAX` repeated the schema's 120-character cap, so the title-length fact went away; the brief schema enforces it and the model judges keyword order.
  - The test helper rebuilt `createVideoPricing`. `createServer` now takes an options object.
  - Skipped: one shared "log the error class" helper for `auth.ts`, `routes/mcp.ts` and `tools/judge.ts`. It would change files outside this diff. `judge.ts` now uses the same `"unknown"` fallback.
- **Simplification:**
  - `verdict` is derived from the checks, and the model no longer sends it (`judgeReplySchema`).
  - The code-only rules sit in one `CODE_ONLY` set, and the prompt reads its rule list from `judgeRuleSchema`.
  - The double zod parse went with the flow.
  - `judgeCheckSchema` is no longer exported.
  - Skipped: deriving `configured` from whether `judgment` is present. The explicit flag is clearer for the agent and is what the MCP output schema documents.
- **Efficiency:**
  - The JSON schema was sent twice. Genkit already adds it to the prompt and to `response_format`, so the copy in the system prompt is gone.
  - Skipped: lazy-loading Genkit when no key is set. `createAi` would become async along with `createMcpFetch`, for a one-time import cost.
- **Altitude:**
  - The zod 4 to JSON Schema bridge moved into a typed `generateObject` in `lib/ai.ts`, which later Genkit calls reuse.
  - `createServer` takes a deps object.
  - Exporting the color limits to the playbook text was skipped: the playbook is prose for the agent.

Security review (automated, on the pushed commits):

- **Genkit span payloads.** Genkit writes each action's input and output (the brief, the prompt, the reply) as `genkit:input`, `genkit:output` and `genkit:init` attributes, and Genkit 1.42 has no setting to turn that off. Those spans went to wovain's tracer and on to GitLab Observability. A second pass found the same text in exception events (`exception.message`, `exception.stacktrace`) and in `status.message` on failed spans. Fixed: `telemetry.ts` wraps the batch processor in `RedactingSpanProcessor`. For Genkit spans (those with `genkit:name` or `genkit:type`) it exports only an allowlist of attributes (name, type, path, state, root and failure flags, subtype). Events go out as name and time only, and the status as its code only. Other spans pass through untouched. `telemetry.test.ts` covers the success path, the error path and pass-through.
- **Unbounded input to a paid model.** Fixed: `designBriefSchema` bounds every string (idea 500; blank, placement and color names 120; artwork URL 2048; description 300; the existing title cap of 120 and coach cap of 160) and allows at most 20 colors. The bounds live on the brief schema, not on `designSchema`, so stored designs still parse. No per-user rate limit: nothing installed makes it trivial, and every call already sits behind sign-in and the allowlist.

The `pr-review-toolkit` agents (code-simplifier, silent-failure-hunter) aren't installed in this session. The silent-failure pass was done by hand:

- `judge_design` logs the error class and rethrows a user-safe error.
- `configured: false` is explicit and documented.
- The playbook tells the agent to go on without the check on an error.

## Try it

1. In `apps/server/.env`, set `NEBIUS_API_KEY` to a Token Factory key, then run `pnpm test:live`. It should pass, confirming the model id and that structured output works.
2. Run `pnpm dev` with the key, connect an agent and say "design a tee for: a cat watching a sunset". The agent calls `judge_design` before the design widget, and the trace shows the Genkit spans under `mcp.request`.
3. Without the key, the same flow shows the widget, and `judge_design` answers `configured: false`.
4. The review app has no key yet. To enable it in production, set `pulumi config set --secret nebius-api-key` in `infra/` and list `NEBIUS_API_KEY` in `apphosting.yaml`.

## Departures from the plan

- `judge_design` is in a new `tools/judge.ts`, not in `tools/design.ts`, because `design.ts` is close to the oxlint file and function length caps.
- There's no Genkit flow. The judge calls `generateObject` (`ai.generate`) directly, so the result stays typed without a second parse. The generate and model spans still trace.
- The model sends no `verdict`; code derives it. The title-length check is enforced by the brief schema, not by a code fact.
- New since the plan: `RedactingSpanProcessor` in `telemetry.ts` and the bounded brief schema, from the security review.
- `createServer(env, store, { designJudge, videoPricing })` replaces the planned positional parameter.
- `pnpm test:live` loads `apps/server/.env` (`node --env-file-if-exists`), so a key saved there runs the live test.
