# Spec: Genkit and Nemotron on Nebius Token Factory for wovain's own model calls

Intent: [intent.md](intent.md)

## Requirements

1. `apps/server` depends on `genkit` and `@genkit-ai/compat-oai`, pinned exactly at 1.42.0. 1.43.0 came out on Oct 21, inside Renovate's 7-day `minimumReleaseAge`.
2. One module creates the Genkit instance with the `nebius` plugin (`baseURL` `https://api.tokenfactory.nebius.com/v1/`, `apiKey` from `NEBIUS_API_KEY`). The judge's model id lives in that module as a single config constant: `nebius/nvidia/nemotron-3-super-120b-a12b` (Nemotron 3 Super).
3. Without `NEBIUS_API_KEY` no Genkit instance is created, the server starts, and `judge_design` answers `{ configured: false }` with one line telling the agent to skip the check and how to turn it on. It doesn't throw.
4. A new tool, `judge_design`, takes the design brief the agent is about to show (idea, blank, placement, colors, artwork metadata, listing, coach line, plus an optional one-line description of the artwork) and returns `{ configured: true, judgment }`. `judgment` follows a zod schema: a verdict (`ready` or `revise`), a 0–100 score, one check per print rule with pass and a short note, up to 5 fixes, and a suggested coach line.
5. Rules that code can decide (print size, transparency, title length, color count) are computed in code and overwrite whatever the model says. If one fails, the verdict is `revise`, whatever the model returned.
6. The model's reply is validated with the zod schema. A reply that doesn't parse, or a Token Factory error, becomes a user-safe error ("The design check failed; show the widget without it."). No raw upstream error reaches the agent.
7. The design playbook calls `judge_design` before `show_design_widget`. On `revise` it applies the fixes once, then shows the widget either way. On `configured: false` it skips the step.
8. Genkit doesn't start its own OpenTelemetry SDK. Its spans go to wovain's existing tracer, so the judge call appears under the `mcp.request` span in GitLab Observability.
9. Unit tests use `mockModel` from `genkit/testing` and never reach the network. One opt-in test (`pnpm test:live`) calls Token Factory and is skipped without the key.
10. README gets a "Nebius and Nemotron" section. `docs/spec.md` changes wherever it states a fact that changes here.

## Design

### Why the design judge is the first use

The issue names two candidates: listing copy and the design judge. The judge comes first because:

- It moves work off the host agent that the agent does badly: grading its own output. The agent writes the listing and picks the colors, then has to check them against eight playbook rules it may have half-read. A second model with a fixed rubric and a schema catches what self-review misses.
- It produces a checkable, schema-bound result (pass or fail per rule), which suits a judge's zod output. Generated copy is harder to test.
- #4 needs a Nemotron judge. This one covers the text half (brief, listing, colors, print numbers), and #4 adds the image and the widget display on top of the same flow and schema.

Listing copy can come later as a second Genkit flow on the same instance.

### Packages, checked in node_modules (1.42.0, installed in a scratch folder)

- `@genkit-ai/compat-oai`: `openAICompatible(options: PluginOptions)` returns a `GenkitPluginV2Instance`. `PluginOptions` extends the OpenAI client options (`baseURL`, `timeout`) with `name`, `apiKey` and optional `resolver` and `listActions`. With no resolver, any model name under the plugin's namespace resolves on demand (`defineCompatOpenAIModel`), so `nebius/nvidia/nemotron-3-super-120b-a12b` needs no registration. `output.format: "json"` with a schema becomes `response_format: { type: "json_schema", json_schema: { name: "output", schema } }`. Nebius documents `json_schema` in `response_format` (docs.tokenfactory.nebius.com/ai-models-inference/json) and advises putting the schema in the prompt too.
- `genkit`: `genkit({ plugins })`, `ai.defineFlow`, `ai.generate({ model, system, prompt, output: { format: "json", jsonSchema }, config: { temperature } })`. `genkit/testing` exports `mockModel` for tests. `genkit/tracing` exports `disableGenkitOTelInitialization()`; without it, the first action run calls `enableTelemetry({})` and starts a second OpenTelemetry Node SDK next to `telemetry.ts`.
- Genkit is built on zod 3 (`@genkit-ai/core` depends on `zod@^3.23.8`). wovain's schemas are zod 4. Passing a zod 4 schema as Genkit's `output.schema` would not type-check. So the judgment schema stays zod 4 in `packages/shared`. It goes to Genkit as `output.jsonSchema` (`z.toJSONSchema(schema, { target: "draft-7" })`, the draft Genkit's ajv validates), and the reply is parsed again with the zod 4 schema. Flows take no Genkit `inputSchema`. The MCP tool's zod 4 `inputSchema` already validates the input.

Libraries checked and not used: the `openai` SDK directly (Genkit is the chosen layer and adds flows, tracing and test models), Genkit's own `@genkit-ai/openai` plugin (it targets OpenAI's model list), Vercel AI SDK (not the framework `docs/spec.md` names).

### Files

`packages/shared/src/judge.ts` (new):

```ts
export const judgeRuleSchema = z.enum([
  "print_size", // code: artwork.widthPx >= artwork.requiredPx
  "transparency", // code: artwork.transparent
  "title", // code: length <= 120; model: main keyword first, then design element, then style
  "description", // model: two short on-brand lines, no garment specs
  "colors", // code: 3 to 5 in stock; model: each contrasts with the artwork
  "idea_fit", // model: the blank, placement and listing match the idea
]);
export const designJudgmentSchema = z.object({
  checks: z.array(
    z.object({
      note: z.string().max(200),
      pass: z.boolean(),
      rule: judgeRuleSchema,
    })
  ),
  coach: z.string().min(1).max(160),
  fixes: z.array(z.string().max(200)).max(5),
  score: z.int().min(0).max(100),
  verdict: z.enum(["ready", "revise"]),
});
export const designBriefSchema = designSchema
  .pick({
    artwork: true,
    blank: true,
    coach: true,
    colors: true,
    idea: true,
    listing: true,
    placement: true,
  })
  .extend({ artworkDescription: z.string().max(300).optional() });
export const judgeResultSchema = z.object({
  configured: z.boolean(),
  judgment: designJudgmentSchema.optional(),
});
```

The MCP SDK requires `structuredContent` whenever a tool has an `outputSchema` (it throws "has an output schema but no structured content"), and an output schema must be one object. So "not configured" is `{ configured: false }` and not a missing result. Nothing here is stored in Firestore.

`apps/server/src/lib/ai.ts` (new): `createAi(apiKey?: string)` returns `undefined` without a key. Otherwise it calls `disableGenkitOTelInitialization()` once and returns `genkit({ plugins: [openAICompatible({ apiKey, baseURL, name: "nebius", timeout: 60_000 })] })`. It exports `models = { judge: "nebius/nvidia/nemotron-3-super-120b-a12b" } as const`, the one place to change the model.

`apps/server/src/lib/design-judge.ts` (new): `createDesignJudge(ai: Genkit, model = models.judge)` defines the `judgeDesign` flow and returns `(brief: DesignBrief) => Promise<DesignJudgment>`.

- `ruleFacts(brief)` computes the code-decided checks (pure, unit-tested).
- The system prompt holds the rubric (the playbook's listing and color rules) and the JSON schema. The user prompt is the brief as JSON plus the computed facts.
- `temperature: 0.2`. The reply is `designJudgmentSchema.parse(response.output)`.
- `applyFacts(judgment, facts)` replaces the code-decided checks and forces `revise` when one fails.

`apps/server/src/tools/design.ts`: `registerDesignTools(server, store, judge?)` registers `judge_design` (read-only, `openWorldHint: true`). `judge === undefined` gives `{ configured: false }` and the line "The design check isn't set up (NEBIUS_API_KEY). Skip it and show the widget." Errors from `judge` are caught, logged with the error class only, and rethrown as one user-safe `Error`.

`apps/server/src/server.ts` and `http.ts`: like `videoPricing`, the judge is built once per process in `createMcpFetch` (`createDesignJudge` over `createAi(env.NEBIUS_API_KEY)`) and passed to `createServer(env, store, videoPricing, designJudge)`, which defaults to the same expression for tests and stdio.

`apps/server/src/playbooks/design.ts`: a new step between Listing and Widget: "**Check.** wovain `judge_design` with the brief. On `revise`, apply its fixes once (listing, colors, coach; for print size or transparency, step 5), then show the widget. Use its coach line unless yours is better. On `configured: false`, go on."

`apps/server/src/env.ts`: `NEBIUS_API_KEY` is already there (!29). Only its comment changes, to say the design judge uses it.

## Areas of concern

- **Cost.** Each design adds one Nemotron 3 Super call: a few thousand tokens in and a few hundred out. A third-party listing (Eden AI, unverified) puts it at $0.30 and $0.90 per million tokens, so well under a cent per design. Nothing runs without the key.
- **Latency.** One more model call before the widget, with a 60 s client timeout. A failure doesn't block the widget: the playbook goes on without the check.
- **Model reliability.** Nebius says structured output varies by model. The schema is in both `response_format` and the prompt, the reply is parsed with zod, and code owns every rule it can decide. The live test confirms Nemotron 3 Super returns valid JSON for the schema. If it doesn't, the fallback is `format: "json"` without a schema plus zod parsing.
- **Model id.** `nvidia/nemotron-3-super-120b-a12b` comes from Nebius's own Nemotron 3 Super announcement (its Playground link). It's one constant, and the live test fails loudly if the id is wrong.
- **Dependencies.** Genkit pulls in express, `@opentelemetry/sdk-node` 0.52 and zod 3 next to wovain's zod 4 and OpenTelemetry 2.x. Install scripts: `protobufjs` and `@firebase/util` are already set to `false` in `allowBuilds`. Any new entry is added at install time. Disabling Genkit's OTel startup avoids a second tracer provider.
- **Privacy.** The judge sends the brief (idea, listing, colors, numbers) to Nebius, and no merchant identity or email. Logs carry the error class only.
- **Records.** No Firestore shape changes.
