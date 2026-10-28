# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/20 (added when the issue is filed). Branch: `feat/gate-design-generation`.

## Why

A manual run draws fal artwork for its top three ideas as soon as research ends, before the merchant has seen any idea. That spends design credits and the merchant's own fal account on ideas they may not want. The merchant asked: "don't create designs automatically before I say see design, and only the approved ones."

## What Changes

- A manual run stops after research at a new ideas gate (`awaiting_approval`, step `ideas`) and draws nothing.
- New procedure `runs.approveIdeas({ id, ideaIds })`, the wizard's **See designs** button: it resumes the run, which draws one design for each approved idea and no other, then waits at the design gate as before.
- New MCP tool `approve_ideas` calls the same procedure; `start_run`'s description says the run stops at the ideas.
- A design decision opens the design gate only when the run waits there, never while it waits for ideas.
- Autopilot is unchanged: the merchant turned it on so Nemotron makes these calls. It picks the lead idea and draws the top three without stopping.
- The legacy engine (the `mastra-runs` fallback) follows the same steps.
- Wizard copy no longer says the top ideas already have designs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runs-and-approval`: the run waits for the merchant's ideas before it draws, and draws only for those.

## Impact

`packages/api` (run workflow, legacy engine, `flow/runs.ts`, `flow/designs.ts`, `routers/seller.ts`, `mcp.ts`, `flow/transitions.ts`), `apps/web` (new-drop flow and its copy in en, es, fr), `docs/prd.md`, `docs/spec.md` and their docs-site copies. No schema change: the ideas gate reuses `awaiting_approval` with step `ideas`.
