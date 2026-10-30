# Design

## Context

The foundation (#58) added `brand_profile`, `suggestion`, `approval`, `decision_trace`, the autonomy policy (`canAutoExecute`), the approval service and the Inngest event contracts. Runs already have an autopilot mode in which Nemotron decides the ideas and design gates (`packages/core/src/autopilot.ts`). This change adds the part that starts runs on its own.

## Goals / Non-Goals

Goals: a per-brand scan on a schedule, suggestions backed by evidence a merchant can open, autopilot that never goes past the autonomy level, a credit cap, and a log that says what happened in plain words.

Non-goals: push delivery (the mobile workstream consumes `wovain/notify`), new tables, Qloo's `/v2/trending` time series, LLM-written rationales, activating ad spend.

## Decisions

1. **Fan-out cron, rate-limited per brand.** `autopilot-scan-schedule` (cron `0 */6 * * *`) lists brand profiles of merchants who have not paused the agent and sends one `wovain/autopilot.scan` per merchant. `autopilot-scan` has `rateLimit { key: userId + reason, limit: 1, period: 6h }` (one scheduled and one manual scan per brand every 6 hours) and `concurrency { key: event.data.userId, limit: 1 }`, so two scans of one brand never run at once. The flag is checked in the scan, per merchant.
2. **Qloo signal: `bias.trends`.** `/v2/insights` with `filter.type=urn:entity:brand`, `signal.interests.entities` = the brand's Qloo entity IDs and `bias.trends=high` returns brands rising with that audience, with an affinity. Only entities at or above `MIN_AFFINITY` count. A brand without Qloo entities skips Qloo; a Qloo failure is logged at error level and the scan goes on with Tavily.
3. **Tavily evidence.** For the top two rising names and the first two niches, one news search each (`topic: news`, `timeRange: week`, `searchDepth: basic`, 5 results), filtered with `rankSources` (relevance at least 0.4, at most 7 days old, shares a word with the query). Each search settles on its own; a failure is logged and the rest still count.
4. **Deterministic match, no LLM.** A query with at least one kept news hit is a match. Score = top hit relevance × (Qloo affinity when Qloo-led, else 1). At most two suggestions per scan, highest score first. The rationale is built from the facts (entity, affinity, headline, count), so it never claims what the data doesn't say. The dedup key is `trigger:subject` (normalized); a key seen in the last 7 days is skipped.
5. **Autopilot through the queue.** `autopilot-act` (on `trigger.fired` with a suggestion) enqueues `autopilot.run.start` (R1) with `proposedBy: autopilot`, `idempotencyKey: suggestion:<id>` and a cost preview in credits. The approval service settles it with `canAutoExecute`, which already handles `paused` and the level. When the merchant isn't entitled to autopilot or the credit cap would be passed, nothing is enqueued and the suggestion waits for the merchant; the reason goes in the trace.
6. **Executor picks the run mode by policy.** `autopilot-execute` (on `approval.decided`, approved, `autopilot.run.start`) records `executing`, then starts the run with `autopilot = canAutoExecute({ type: "store.product.publish" }) === allow`. On `draft` the run researches and waits at the ideas gate; on `publish_ads_paused` it decides its gates, publishes and stages paused campaigns, as autopilot runs already do. It records `done` with the run ID, or `failed` with the error (also logged at error level).
7. **Credit cap from actual spend.** Credits spent by autopilot today = the sum of `credit_reservation.credits` (held or settled, created today UTC) for runs recorded on today's `autopilot.run.start` approvals proposed by autopilot. A run is started only when that plus the run's estimate (research + designs × (design + assist) + assist) fits the plan's `autopilotDailyCredits`.
8. **Entitlement.** `assertAutopilot` accepts the plan's `autopilot` or the `autopilot` flag, matching what `billing.status` already reports. Dev and next catalogs set Free's `autopilot: true`; production stays false.
9. **Decision log.** `autopilot.log` returns the merchant's latest suggestions, each with its approval (status, policy reason) and its decision trace entries. The page narrates each entry with a sentence per step (scan, Qloo, Tavily, match, policy, run).

## Risks / Trade-offs

- A run started by autopilot still needs the merchant's fal connection; without it the executor records `failed` with the reason. Honest, but noisy on accounts without fal.
- Free has 15 credits a month, which is one autopilot run. The cap protects the merchant, the monthly grant protects wovain.
- Qloo's `bias.trends` is only honored for some entity types; brands are one of them.
