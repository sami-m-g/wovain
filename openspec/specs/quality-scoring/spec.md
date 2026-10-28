# quality-scoring Specification

## Purpose

How wovain checks model output before it reaches a designer: code facts that override models, and the LLM judge. Scorers on every step are proposed in the `migrate-runs-to-mastra` change.

## Requirements

### Requirement: Code facts override models

Print size, the price floor, the budget range and the paused state SHALL be decided by code, and SHALL override any model output.

#### Scenario: Model approves an undersized print

- **WHEN** the judge says `ready` but the print-size check fails
- **THEN** the verdict is `revise`

### Requirement: LLM judge

Every generated design SHALL be judged by Nemotron with a verdict, a score and up to five fixes, and the judgment SHALL be stored on the design.

#### Scenario: Judgment stored

- **WHEN** a design is generated
- **THEN** its verdict, score and fixes are saved with it

### Requirement: LLM tracing

Model calls SHALL be reported to PostHog LLM analytics with the model, tokens, cost and latency.

#### Scenario: Brief written

- **WHEN** Nemotron writes a brief
- **THEN** an `$ai_generation` event is captured for that call

### Requirement: Scorers on every step

Every agent and workflow step SHALL have at least one Mastra scorer: code scorers for facts (print size, avoided names, length limits, price floor) and LLM judges for subjective quality (brief, idea fit, ad copy, autopilot picks). Scores SHALL be stored with the run and sent to PostHog as `agent_score` with `run_id`, `scorer`, `score` and `target`.

#### Scenario: Design scored

- **WHEN** a design step completes
- **THEN** its scores are stored with the run and an `agent_score` event is captured for each scorer

### Requirement: Calibrated judges

An LLM judge SHALL be trusted for gating only after its agreement with human labels on a labeled set meets a stated threshold, and the labeled set SHALL run in CI when prompts or models change.

#### Scenario: Prompt change

- **WHEN** an agent's instructions change in a merge request
- **THEN** CI runs the scorers on the labeled set and reports the change in scores

### Requirement: Guardrails

Agent inputs and outputs SHALL pass guardrails that block avoided names, trademark or unsafe prompts and over-length fields before the output is saved or sent to a provider.

#### Scenario: Avoided name in output

- **WHEN** a brief contains a name listed to avoid
- **THEN** the output is blocked and the step retries or fails with the reason
