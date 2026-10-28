# Design

## Context

Agents are Mastra agents built once per process (`packages/core/src/agents.ts`). Flags are evaluated per merchant, asynchronously, so the routing decision has to travel with each call, not with the agent.

## Decisions

- **Routing per call through the request context.** `packages/api` evaluates `model-routing` once per traced block (`withAgentTrace`) and puts `routed` in the LLM trace. `ask` copies it into Mastra's request context. The agent's model, input and output processors and scorers are Mastra dynamic arguments that read it. Agents keep their IDs, so Studio, memory and stored scores are unchanged.
- **Roles live in core (`AGENT_ROLES`).** Code asks for a job, never a model ID. Model IDs stay env vars set from Pulumi.
- **Reasoning on Ultra, safety on Lightning.** Token Factory lists `nvidia/Nemotron-3-Ultra-550b-a55b`, `nvidia/Nemotron-3.5-Super-VL` and `nvidia/Nemotron-3_5-Lightning`. It lists no Nemotron safety model, so `NEMOTRON_MODEL_SAFETY` is Lightning and moderation stays Mastra's `ModerationProcessor`. Production keys are unchanged; the flag is off there.
- **A deterministic grounding guard.** A regex over buyer-facing fields compares numbers (normalized, so "10,000" matches "10000") and a fixed list of claims with the prompt, which is built from tool results. Claims match as whole words on both sides, so "#10" or "officially" in the evidence doesn't back "#1" or "official". An LLM checking an LLM for invented facts can invent the same fact. Paraphrased claims stay with the ad judges. One retry with the offending items named; then `UNGROUNDED_CLAIM` (422). A guarded call of a remembering agent reads its memory read-only, and only the answer the guard accepts is saved to the thread, so a rejected answer never returns as history.
- **Ad scores without a migration.** The score is written once per campaign through `once` under `<campaign key>:score`, next to the copy (`external_write`). Insights maps campaign IDs to those keys. Judges run on the fast model as an `ad_judge` agent, so they are routed, traced and in PostHog like any call.
- **The decision trace.** `ask` records each call with `DecisionTrace.call` (model, input field names only, duration, output) and each guard check as a `rule` entry. `withAgentTrace` flushes at the end of the block; a failed save goes to error tracking and does not fail the work.
- **The page.** `models.trace({ runId? })` returns the role → model map and the run's entries (the latest traced run by default). `/dashboard/models` renders them; Runs links each row to it when the flag is on.

## Risks

- Ultra's latency and its structured-output support on Token Factory were not verified without a key; the judge and autopilot have a 90 s timeout. Rollback: set `nemotronModelReasoning-next` to Super VL, or turn the flag off.
- `NEMOTRON_*_PRICE` is `NEMOTRON_MODEL`'s price. A routed call on another model (Ultra, Lightning) sends no PostHog cost override, so PostHog prices it from its own model table; a model PostHog doesn't know shows no cost rather than a wrong one. Per-role prices are a follow-up.
