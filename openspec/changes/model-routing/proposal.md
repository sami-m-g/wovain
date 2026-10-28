# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/67

## Why

Every agent, scorer and guardrail calls one Nemotron model. The foundation (#60) added a model per job (`NEMOTRON_MODEL_{FAST,DEFAULT,REASONING,VISION,SAFETY}`), but nothing reads it yet. Ad scores on the insights page are a stub that always says "not scored". Nothing stops ad copy or a listing from stating a number or claim the research never produced. The merchant and the Nebius judges can't see which model did which step.

## What Changes

- With the `model-routing` flag on for the merchant, each agent runs on its job's model: default for briefs, research themes and ad copy; reasoning for the design judge's verdict and autopilot's decisions; vision for the judge's look at the drawn PNG; fast for the ad judges, scorers and the injection and PII guardrails; safety for moderation. Off, nothing changes.
- Reasoning is Nemotron 3 Ultra on dev and next. Token Factory serves no Nemotron content-safety model, so safety stays the fast model with Mastra's moderation.
- A grounding guard checks buyer-facing text (ad copy, the listing title and description). A number or claim that is not in the tools' results sends the answer back once. A second miss fails the step.
- The binary ad judges (copy quality, Meta policy) score each campaign's copy on the fast model when it is staged. The insights page shows that score.
- Every agent call and guard check of a run is saved to its decision trace. A new "which model did what" page shows the models per job and each step's agent, job, model, time and result, linked from Runs.
- The README names the Nemotron models per job and where Token Factory helped.

## Capabilities

### Modified Capabilities

- `model-routing`: agents run on the model for their job, buyer-facing text is grounded, ad copy is scored, and every call is traced and shown.

## Impact

- `packages/core`: agents (routing by request context), nemotron (trace, grounding), grounding (new), ads (ad scores), scorers, core
- `packages/api`: `withAgentTrace` replaces `withLlmTrace` at the four call sites; insights reads stored ad scores; new `models.trace` procedure
- `apps/web`: `/dashboard/models` page, a Models link on Runs, messages in en, fr and es
- `apps/web/.env.schema` and `infra/Pulumi.prod.yaml` (`nemotronModelReasoning-dev` and `-next` set to Ultra; production keys unchanged)
- No new tables or migrations: traces use `decision_trace`, and ad scores sit in `external_write` next to the campaign's copy
