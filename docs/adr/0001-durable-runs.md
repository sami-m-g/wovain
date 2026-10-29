# ADR 0001: Durable runs on Mastra workflows with Inngest

- Status: accepted
- Date: 2026-10-26
- Scope: `packages/api/src/workflows`, `packages/api/src/flow/*`, `packages/mastra/src/mastra/agents/ask.ts`, `apps/web/src/app/api/inngest`

## Context

A seller run is research, then design, then approval, then product, then publish, then a paused Meta campaign. Before this change, the whole run executed inside one oRPC request (`flow/runs.ts`) on Cloud Run. That caused three problems:

- **Lost runs.** Cloud Run has `cpuIdle: true` and a 300 s default timeout. An autopilot run makes about 5 Nemotron calls, a fal drawing, 6 Tavily calls, about 4 Fourthwall calls and 2 + 2n Meta calls. A crash or timeout left the run at `running` for good.
- **Duplicate writes.** Fourthwall and Meta writes had no idempotency, so a retry could create a second product or campaign. A Meta failure partway through left orphaned objects.
- **Approval didn't resume.** Approving a design ended the run instead of continuing it, and approve and reject had no state check.

## Decision 1: the durable engine is Inngest, through `@mastra/inngest`

| Criterion | Inngest (Cloud) | Vercel Workflow + `@workflow/world-postgres` | DBOS Transact |
| --- | --- | --- | --- |
| Cloud Run scale-to-zero | **Good.** Inngest pushes each step to `/api/inngest` as its own HTTP request, so no process has to stay up. | **Poor.** It embeds a Graphile Worker that polls Postgres every 500 ms from an always-on process (`world.start()`). CPU throttling and scale-to-zero stop it. | **Poor.** It runs in-process and recovers when a process starts, so it needs min-instances ≥ 1 with CPU always allocated. |
| Self-host vs cloud | Cloud, or self-hosted with `inngest start` (single-node beta; the Helm chart is the production-ready option). | Self-hosted reference implementation ("not a managed backend"), and its flow route has no auth. | Self-hosted library. Conductor or DBOS Cloud is optional. |
| Cost at our scale | Free tier: 50k executions and 5 concurrent steps a month. Pro is $99/mo for 1M executions. | Free, plus an always-on Cloud Run instance. | Free, plus an always-on instance. Conductor Pro is $99/mo. |
| Next.js 16 fit | `serve` from `inngest/next` gives one route handler. | `"use workflow"` compiler plugin. | Plain library. Startup needs a long-lived process. |
| Approval gate | `step.waitForEvent`, or Mastra `suspend()`/`resume()`. | Hooks and webhooks. | `DBOS.recv`. |
| Local dev | `npx inngest-cli dev` Dev Server with a run UI. | Local world. | Local Postgres. |

**Inngest wins** because it is the only option that fits a scale-to-zero, CPU-throttled Cloud Run service without adding an always-on worker. Vercel Workflow and DBOS both need a process that stays alive, which costs money all day and works against the reason we use Cloud Run.

## Decision 2: the agent framework is Mastra (chosen by the product owner)

We write the run as a **Mastra workflow** (`createWorkflow` and `createStep` from `init(inngest)` in `@mastra/inngest`). The model calls run through **Mastra agents** on the AI SDK's `@ai-sdk/openai-compatible` provider for Nemotron on Nebius.

- **How Mastra maps onto Inngest.** Each workflow becomes one Inngest function (`workflow.seller-run`). Each step runs in `step.run`, so a retry skips the steps already done. Step retries use `retries` plus `retryConfig {attempts: 3, delay: 5 s}`, a fixed delay. Inngest's function-level `retries: 4` re-invokes the whole function with exponential backoff after an invocation dies (a crash, timeout or deploy), and memoized steps are skipped.
- **The approval gate.** Mastra's `suspend()` saves a snapshot to Postgres through `@mastra/pg` `PostgresStore`, in its own `mastra` schema. The Inngest run then ends, so the gate costs nothing while the merchant decides. `decideDesign` calls `run.resumeAsync({step: "approval"})`, which sends a new event, and the run continues to the product and the campaign. This is Mastra's resume, not `step.waitForEvent`: Mastra's Inngest runner doesn't use `waitForEvent`. The effect is the same, and the run resumes. Unlike `waitForEvent`, the gate has no timeout yet. A cron sweep can expire stale approvals later.
- **Maturity.** `@mastra/inngest` 1.10.7 and `@mastra/core` 1.79.0 are pinned exactly in the catalog, because Mastra publishes alphas several times a day. The docs mark only Inngest Connect workers as beta, and we don't use them. Known open issues we avoid:
  - durable-agent tool approvals have double-approval bugs (#27485, #27925, #27898), so we use workflow-step suspend instead;
  - durable operation IDs collide across loop iterations (#24044), so the workflow has no loop yet. A judge→regenerate loop must stay inside one step.
- **Rejected:**
  - **Google Genkit 1.43.** It has no durable or suspend model that composes with Inngest, and it is Gemini-first, so we would hand-build the approval gate.
  - **Google ADK for TypeScript 2.3.** It is young (first release 2025-10). Its strengths are Vertex AI Agent Engine and A2A, which we don't need, and its session persistence overlaps with Inngest.
  - **Plain AI SDK on Inngest.** It is viable and lighter, but it lacks Mastra's suspend/resume, scorers and tracing, which the product owner wants.

## Decision 3: every external write is keyed

A step can still die after a provider accepted a write but before the step's checkpoint. Inngest replays the step, so each write must be safe to send twice. The `external_write` table (`flow/once.ts`) works like this:

- Before the call, the key is saved as `pending`. After the call, it is saved as `done` with the result.
- A retry that finds `done` reuses the result and sends nothing.
- A retry that finds `pending` (the earlier attempt lost its answer) first looks the object up on the provider, and sends the write again only if nothing is found:
  - **Fourthwall:** the offer is matched by its customization (`ecommerce_get-offers`).
  - **Meta:** the campaign, ad set and ad are matched by a name ending in a stable tag (`ads_get_ad_entities`).
  - **fal:** the request ID is saved once it is submitted, and `get_job_result` is a read.
- Design, product and campaign rows carry a unique `idempotency_key`. `products.create` and `campaigns.create` accept a `requestId` (AIP-155).
- A Meta staging that fails partway **resumes** on retry. A run that fails for good **archives** the campaign it half staged (`compensateRun`).

## Decision 4: guarded transitions and the operation shape

- `designs.approve` and `designs.reject` only move a design out of `pending_approval`, with `UPDATE … WHERE status = 'pending_approval'`. Otherwise they return the typed oRPC error `DESIGN_ALREADY_DECIDED`. A merchant's decision and the run's resume happen in one transaction. If the resume can't be queued, the call returns `RUN_NOT_WAITING` and the decision is rolled back.
- `runs.start` is a long-running operation (AIP-151). It saves the run, queues it and returns at once. The wizard polls `runs.get`, and ChatGPT polls `get_run`.
- A run whose Inngest function fails for good is ended by an `inngest/function.failed` handler: it is marked failed and its Meta staging is archived.

## Consequences

- **New secrets:** `inngest-event-key` and `inngest-signing-key` (Secret Manager, mounted as `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`). They come from the Inngest app's settings. Runs can't start until both are set.
- **Cloud Run:** the request timeout is raised to 900 s, because the slowest step (a design) can exceed 300 s.
- **Sync:** CI syncs the app with `PUT /api/inngest` after each deploy (`sync:inngest`).
- **Local:** set `INNGEST_DEV=1` and run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`.
- **Billing:** Inngest bills per execution, and Mastra adds a few `step.run` calls per run for spans and finalize, so a run uses about 10 to 15 executions.
- **fal:** fal now runs on the merchant's own fal account through fal's MCP relay (OAuth), so wovain carries no fal cost.
