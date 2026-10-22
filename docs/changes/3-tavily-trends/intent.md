# Intent: trend research with Tavily

Issue: #3

## Problem

A merchant who opens wovain without a product idea has nothing to start from. The design playbook assumes the merchant brings the idea, so the first designs come from guesswork instead of what people are talking about this week. The issue also asks for a runtime Tavily call (Nebius's Tavily prize).

## Desired outcome

- A `research_trends` tool takes a niche, an audience or a seed idea and returns 3 to 5 ranked tee ideas. Each idea links the Tavily sources it came from.
- Tavily is called at runtime through its official SDK, `@tavily/core`.
- With `NEBIUS_API_KEY` set, Nemotron ranks and phrases the ideas through the existing `generateObject` helper. Without it, code ranks the trends by recency and source count.
- A small pre-publish trademark screen: one Tavily search for the exact phrase plus "trademark", returned as possible hits for the merchant to check. It isn't legal advice and never blocks.
- The design playbook calls `research_trends` when the merchant has no idea yet, and the trademark screen before approval.
- Without `TAVILY_API_KEY`, both tools answer `{ configured: false }`, as `judge_design` does.
- The `tavily-api-key` stack secret now has a value, so `apphosting.yaml` lists `TAVILY_API_KEY`.

## Constraints

- Tavily only in this change. Qloo comes in a later change on the same issue; the result shape leaves room for its signals.
- Tavily charges per call: bound every input string, use basic-depth searches only, and never log query text or results or send them to telemetry.
- Tests mock Tavily. One opt-in live test runs when `TAVILY_API_KEY` is set.
- No `pulumi up` or state commands. The secret's value is committed as ciphertext in `infra/Pulumi.prod.yaml`.
- No change to stored Firestore record shapes: nothing here is stored.
- New packages use exact pins and respect Renovate's 7-day minimum release age.
- AGENTS.md: TypeScript only, Ultracite, Conventional Commits.

## Open questions

None that block the plan. The cost and the choices that need approval are under Risks in `plan.md`.
