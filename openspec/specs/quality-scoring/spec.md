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
