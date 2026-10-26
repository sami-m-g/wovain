# Proposal

Issue: https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/issues/65

## Why

A run drew a design for its top idea only, so the merchant never saw a second option (seen in production on 2026-10-26). `docs/spec.md` listed "one design per run" as a temporary tradeoff until durable runs existed; they do now. The approval gate also resumed the run on the first decision, so a second design the merchant drew in the wizard was never listed by the run.

## What Changes

- A run draws one design for each of its top ideas (`DESIGNS_PER_RUN`, 3), each charged a design's credits as before. With autopilot, Nemotron's pick leads the list.
- One design, product or campaign failing never fails the others: the run goes on with those that worked, logs each failure at error level, and fails a step only when every item in it failed.
- The approval gate waits until every design of the run is decided. The merchant approves one or more and rejects the rest; the call on the last pending design resumes the run (after its transaction commits, as in !171).
- After the gate, each approved design gets its product, publish and paused campaign (durable engine and legacy autopilot). The legacy manual flow keeps its documented behaviour: the wizard makes them for each approved design.
- The wizard keeps "Pick the ideas" for drawing more designs; going on from the designs step rejects the designs left undecided, so the gate opens.

The run, not the merchant, picks the first designs: the run serves the website, ChatGPT (`start_run`) and autopilot alike, and only the run can give each of them options without a new pick step. The merchant still picks any other idea to draw.

## Capabilities

### Modified Capabilities

- `runs-and-approval`: several designs per run, a gate that waits for every decision, and listing for each approved design.

## Impact

- `packages/api/src/flow/runs.ts`, `flow/designs.ts`, `workflows/run.ts`, `workflows/rollout.ts`
- `packages/core/src/step-scorers.ts`: step scorers average one item per design
- `apps/web/src/components/app/use-drop-flow.ts` and the wizard copy
- Credits: a manual run now costs research plus three designs (9 credits) before ads, against 5 before.
