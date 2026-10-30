# Tasks

Issue #67. Stacks on the foundation (#60).

## 1. Routing

- [x] 1.1 `AGENT_ROLES` and a routed model per role in the agent kit; models, guardrails and scorers picked per call from the request context
- [x] 1.2 `LlmTrace.routed` set from the `model-routing` flag by `withAgentTrace` at every call site
- [x] 1.3 Reasoning set to Nemotron 3 Ultra for dev and next and in `.env.schema`; safety stays Lightning (no Nemotron safety model on Token Factory)

## 2. Guards and scores

- [x] 2.1 Grounding guard for ad copy and the listing title and description, with one retry
- [x] 2.2 `ad_judge` agent and `scoreAdCopy`; scores saved per campaign and read by insights

## 3. Trace and UI

- [x] 3.1 Every agent call and guard check saved to the decision trace
- [x] 3.2 `models.trace` procedure and `/dashboard/models` page; Models link on Runs
- [x] 3.3 README section on the models per job and Token Factory

## 4. Follow-ups (not in this change)

- [ ] 4.1 Re-run the judge evals on the routed models with `NEBIUS_API_KEY` and publish the report
- [ ] 4.2 Confirm Ultra's structured output and latency on Token Factory before turning the flag on in production
