# ADR 0002: Agent quality on Mastra (scorers, judges, memory, guardrails, tracing, rollout)

- Status: accepted. The judges are **not calibrated yet**: their agreement with human labels has not been measured (see "Calibration status").
- Date: 2026-10-26
- Builds on [ADR 0001](0001-durable-runs.md).

## Decision

Every model call runs as a named Mastra agent, registered on the app's one Mastra instance (`packages/mastra/src/mastra/workflows/engine.ts`) with Postgres storage in the `mastra` schema. The agents are `design_brief`, `design_judge`, `ad_copy`, `autopilot_pick_idea`, `autopilot_review_design` and `research_themes` (splits a brief into research themes when Qloo names too few), defined in `packages/mastra/src/mastra/agents/kit.ts` on Nemotron through the AI SDK's openai-compatible provider.

### Scorers on every agent and step

- **Built-in Mastra scorers** (`packages/mastra/src/mastra/scorers/agents.ts`):
  - answer relevancy, prompt alignment, toxicity, bias and completeness, where they fit;
  - faithfulness and hallucination on the brief writer, which works from the research in its prompt.
  - Lower is better for toxicity, bias and hallucination.
  - Tool-call accuracy isn't attached: no agent calls tools, by design (ADR 0001). The provider calls are workflow steps.
- **Custom binary LLM judges** (`packages/core/src/judges.ts`), one failure mode each: design quality, brand fit, trend fit, copyright and trademark risk, ad copy quality, and Meta policy compliance.
  - They follow the write-judge-prompt method: a task, Pass/Fail definitions, few-shot examples only from the train split, and the critique before the verdict, with structured output.
  - Each score is 1 for Pass and 0 for Fail.
- **Code scorers on the workflow steps** (`packages/mastra/src/mastra/scorers/steps.ts`), run on every step:
  - design facts: print size, avoided names, title, description and printed-text lengths;
  - price floor;
  - ad copy lengths.
- **Live sampling:** the agent scorers sample `SCORER_SAMPLE_RATE` of live calls (default 0.1). Mastra saves each score in `mastra.mastra_scorers`. The `scoresToPostHog` exporter (`packages/mastra/src/mastra/workflows/observability.ts`) sends each one to PostHog as `agent_score`, with `run_id`, `scorer`, `score`, `target` and `reason`.
- **Offline evals:** `pnpm --filter @wovain/mastra run evals` runs every judge on the dev and test splits of the versioned labeled set (`packages/core/src/evals/judges.v1.json`). It writes TPR and TNR to `report.v1.json`, and fails when a judge drops more than 0.05 below its entry in `baseline.v1.json`. CI runs it as `evals:judges` when a prompt, a judge, a scorer or the model changes.

### Calibration status (validate-evaluator)

- **Agreement numbers: not measured.**
  - No human labels exist yet. `judges.v1.json` holds 24 seed cases: 4 per judge, written and labeled by the coding agent, with one borderline case each.
  - Nobody on the team has reviewed them, and no Nebius key was available where this was built, so no judge has been run against them.
  - `baseline.v1.json` is therefore empty, and the gate only reports until a baseline is accepted.
- **To calibrate** (validate-evaluator):
  1. Once production runs on Mastra (`mastra-runs` on), sample about 100 real traces per judge from Mastra's store, roughly 50 Pass and 50 Fail. Label them through a lightweight review queue: Mastra Studio's trace and score views where they allow labelling, otherwise a simple internal page. Error analysis on those traces comes first. No labelling happens before then (OpenSpec `migrate-runs-to-mastra` 3.2.2–3.2.4).
  2. The splits come from `splitOf` (about 15% train, 43% dev, 42% test, deterministic by case ID).
  3. Iterate on the dev split until TPR and TNR are both above 0.9, with 0.8 as the minimum.
  4. Run the test split once, and record TPR and TNR in `baseline.v1.json`.
- **Live pass rates:** report them corrected with Rogan-Gladen plus a bootstrap interval (`packages/core/src/calibration.ts`), not raw.
- **Gating:** no judge gates anything until it is calibrated. Today only autopilot's own review gates a run, as before.

### Memory

- Mastra memory on the same Postgres store (`packages/mastra/src/mastra/memory/taste.ts`).
- The brief writer and the ad copywriter keep each run as a thread.
- They share one resource-scoped working memory per merchant, with brand and taste: voice, palette, niches, approved and rejected designs with reasons.
- wovain writes the working memory from the merchant's own decisions in `decideDesign` (`agentManaged: false`). The agents read it but never edit it, so structured output stays tool-free.

### Guardrails

Mastra processors, enabled with `GUARDRAILS=on`:

- **Prompt injection detector on the brief writer's input:** web text in ideas is untrusted.
- **Moderation** on the outputs of the brief writer and the ad copywriter.
- **PII detector** on the ad copywriter's output.
- A block is a tripwire. It fails the step with the non-retriable error `GUARDRAIL_BLOCKED` (422) and the reason.
- Each guardrail is an extra Nemotron call.

### Tracing

- Mastra AI tracing goes to Mastra's store (`MastraStorageExporter`, which Studio reads).
- On Cloud Run, it also goes to Google Cloud Trace through `@mastra/otel-exporter` with `@google-cloud/opentelemetry-cloud-trace-exporter`, using the runner's default credentials. This adds `roles/cloudtrace.agent` and the `cloudtrace` API in infra.
- A run's trace ID is its UUID without dashes.
- PostHog keeps the LLM generations (`$ai_generation`, with `$ai_trace_id` set to the run ID, from the PostHog AI SDK wrapper) and the scores.

### Rollout

- Runs go to the Mastra workflow only while the feature flag `mastra-runs` is on for the merchant.
  - The flag is read through the existing Unleash client with the user ID (`apps/web/src/lib/feature-flags.ts`).
  - It is a small local boolean read until the typed flag registry from `feat/progressive-delivery` lands.
- With the flag off, runs take the legacy in-request flow.
- `run.engine` records each run's engine, so a decision resumes the run where it started.

## Consequences

- **Cost:** a judged call runs up to about 11 more Nemotron calls (scorers), and every call to the brief writer or the ad copywriter runs 1 to 2 guardrail calls. At a 0.1 sampling rate, that is roughly 2× the model cost of a run. wovain pays for Nebius, not the merchant.
- **Studio:** see AGENTS.md.
