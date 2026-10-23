# Intent: fourthwall proxy fails on get-instructions, blocking the design flow

Issue: #32

## Problem

> Fourthwall and fal are connected through wovain, but wovain's `fourthwall` proxy tool failed twice with "Tool is not available: get-instructions". That blocks the design flow (building the product pack and previews), and nothing was created.

Steps: connect Fourthwall to wovain in ChatGPT, ask for a design, and the agent calls `fourthwall` with `get-instructions` as the design playbook says. Fourthwall's `/app` endpoint has no such tool.

## Desired outcome

The design playbook only names Fourthwall tools the upstream has, so the design flow gets past its first Fourthwall call. A call to a tool the upstream lacks tells the agent which tools it can call instead.

## Constraints

- The proxy stays an allowlist of read-only tools; publishing and pricing stay behind `publish_design`.
- No production secrets are decrypted to check the upstream's tools.

## Open questions

None.
