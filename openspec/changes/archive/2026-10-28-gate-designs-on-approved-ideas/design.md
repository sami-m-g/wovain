# Design

## Context

The run workflow (`packages/api/src/workflows/run.ts`, Mastra on Inngest) is research → design → approval → product → campaign. `researchStep` returns the top `DESIGNS_PER_RUN` (3) ideas and `designStep` draws all of them, charging credits and calling fal. The wizard already shows ideas with checkboxes and a **See designs** button, but that button only drew designs for ideas outside the top three.

## Goals / Non-Goals

**Goals:** no fal call and no design charge for an idea the merchant did not approve, in manual runs, on both engines.

**Non-Goals:** autopilot, placement previews, image judging, the "already decided" error, a schema change.

## Decisions

- **A second suspend step, `ideas`, between research and design.** The run suspends there like the approval gate; `runs.approveIdeas` resumes it with the approved idea IDs, which become the design step's input. Alternative: end the workflow after research and draw designs from the request (`designs.generate`). Rejected: the design gate, products and campaigns would then need a second workflow, and drawing would leave the durable engine.
- **Reuse `awaiting_approval` with `step: "ideas"`.** No migration, and every client that shows "Needs you" for `awaiting_approval` stays right. The step tells the two gates apart.
- **The run row is the lock.** `approveIdeas` moves the run from `awaiting_approval`/`ideas` to `running`/`design` in one guarded update, then resumes. A second click finds no waiting run and gets `RUN_NOT_AT_IDEAS`. If the resume fails, the run goes back to the ideas gate and the call answers `RUN_NOT_WAITING` (try again), as a design decision does.
- **Ideas are validated against the run.** Each approved ID must be one of the run's ideas; otherwise `NOT_FOUND`, before anything moves.
- **The design gate opens only at step `approval`.** `commitDecision` adds `step = 'approval'` to its guarded update, so a design drawn by hand (`designs.generate`, MCP `generate_design`) while the run waits for ideas can't resume the workflow at the wrong step.
- **Autopilot keeps its behaviour.** Autopilot's purpose is an unattended run where Nemotron makes the merchant's calls; the `ideas` step passes its ideas straight through.
- **Legacy engine.** `start` stops after research at the ideas gate; a new `approveIdeas` draws in the request and then waits at the design gate, as legacy `start` did before.

## Risks / Trade-offs

- [A manual run in flight when this deploys] → A run suspended at `approval` resumes with the same step ID. A run still in research or design when the new code takes over may resume into the new step list; Mastra's behaviour for a changed step graph mid-run is not verified.
- [The merchant approves many ideas] → Each design is charged on its own and the charge refuses when credits run out, as for `designs.generate`. The input caps at 20 IDs.
- [The merchant clicks See designs while the gate is still being saved] → `RUN_NOT_WAITING`, and the wizard says to try again.
