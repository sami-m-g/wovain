# Spec: fourthwall proxy fails on get-instructions, blocking the design flow

Intent: [intent.md](intent.md)

## Requirements

- Every Fourthwall tool the design playbook names is in the `fourthwall` proxy's allowlist.
- Every Fourthwall tool the playbooks, the server instructions, the allowlist and `lib/` name is on Fourthwall's real tool list (`apps/server/test/fixtures/fourthwall-tools.json`, from `tools/list` on `https://mcp.fourthwall.com/app`, Fourthwall MCP 3.4.7, 2026-10-23).
- When the upstream answers a call with an error and its tool list lacks the tool, the proxy replies `isError` with `{ missingTool, available }`, where `available` is the upstream's tools that the proxy allows.

## Design

- Root cause: Fourthwall's `/app` endpoint dropped `get-instructions`, `load-skills` and `read-skills` and now sends its instructions in the MCP `initialize` reply. wovain's allowlist still offered them and the design playbook started with `get-instructions`; the upstream answered "Tool is not available on this connector: get-instructions".
- `tools/connections.ts`: drop the three tools from the allowlist (export it for the test); the tool description says to start with `ecommerce_get-current-shop`; pass `allowed` to `upstreamReply`.
- `lib/upstream.ts`: `callTool` runs the call on the connected client. On a failure that isn't a refused grant, `missingTool` reads `client.listTools()` (every page) and, if the tool isn't there, returns the recovery reply. A tool list that can't be read leaves the original result or error as it was.
- `playbooks/design.ts`: step 1 is `ecommerce_get-current-shop`, with `omni_knowledge` for policy questions.
- Docs: `AGENTS.md` (Connected services) and `docs/spec.md` (playbooks) no longer require `get-instructions` and `load-skills`.

## Areas of concern

- The recovery reply lists tool names only, from the upstream's own list filtered by wovain's allowlist, so it can't widen what the proxy allows.
- One extra `tools/list` round trip, only on a failed call.
