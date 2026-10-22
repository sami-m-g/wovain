# Intent: merchant connections for Fourthwall and fal

Issue: #19 (the first three go-public chunks from the [architecture decision](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/issues/19#note_4068653948))

## Problem

wovain can't open sign-up while some tools act through the operator's keys. The owner also wants merchants to install wovain alone, with no separate Fourthwall, Meta Ads or fal connector in ChatGPT. Today the playbooks assume the host agent has those three MCP servers connected, and `video_spend` reads the operator's whole fal account with `FAL_BILLING_KEY`, so every user would see everyone's spend.

## Desired outcome

- wovain is an MCP client of Fourthwall's and fal's MCP servers. It holds one OAuth grant per merchant per provider, and the merchant authorizes it on the provider's own consent page.
- Grants are stored in Firestore at `users/{uid}/connections/{provider}`, encrypted with a Cloud KMS key declared in `infra/`. No token is ever in plain text at rest, in logs or in a tool result.
- When a tool needs a provider the merchant hasn't connected (or has to reconnect), it answers with a connect link instead of an error, in any host.
- Two proxy tools, `fourthwall` and `fal`, forward allowlisted read-only or reversible upstream tools. Spending and publishing tools stay off the allowlist. wovain calls them itself behind its approval widgets.
- fal: `video_spend` reads the merchant's own fal account, generation runs from the priced plan on the merchant's grant (`generate_videos`), and `FAL_BILLING_KEY` and `lib/fal-usage.ts` are gone.

## Constraints

- The OAuth mechanics (discovery, CIMD or DCR, PKCE, `state`, the RFC 8707 `resource` parameter, code exchange, refresh) come from `@modelcontextprotocol/client` 2.3.1. Nothing is hand-rolled.
- Infra changes go through `infra/` only. Agents don't run `pulumi up` or state commands.
- No migrations: every new Firestore doc has a zod schema checked on read.
- A rotating refresh token can be spent only once, and production runs up to 2 instances, so refresh must be safe across instances.
- Fourthwall answers an unauthenticated `tools/call` with HTTP 200 and `isError`, not a 401.
- Upstream text (tool results, error messages) is data for the agent, never instructions to wovain.
- Meta stays on the host-MCP path (App Review), and the connections widget is a later chunk.

## Open questions

None that block the plan. Measured during the build: Fourthwall's and fal's token lifetimes and whether they rotate refresh tokens (recorded in `docs/spec.md`).
