# Verify: fourthwall proxy fails on get-instructions, blocking the design flow

## Tests added

- `apps/server/test/unit/fourthwall-tools.test.ts`: failed first on main (the design playbook and the allowlist named `get-instructions`, which isn't on Fourthwall's list). It checks that every Fourthwall tool the design playbook names is allowlisted, and that every Fourthwall name in the playbooks, instructions, allowlist and `lib/` is on `fixtures/fourthwall-tools.json`.
- `apps/server/test/integration/connect.test.ts`: an allowlisted tool the fake Fourthwall lacks comes back as `{ missingTool, available }` with only allowlisted names; `get-instructions` is refused before any upstream call.

## Checks run

`pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `test:e2e`, `build`: all pass.

## Review findings

- Root cause checked against the live endpoint: `tools/list` on `https://mcp.fourthwall.com/app` (unauthenticated) has 143 tools and no `get-instructions`, `load-skills` or `read-skills`; `tools/call get-instructions` answers `isError` "Tool is not available on this connector: get-instructions". The host's own Fourthwall connector shows the same list.
- Every other Fourthwall tool the design playbook and `publish_design` use is on the list.
- Checked before writing a helper: the MCP client SDK's `listTools` (used, with its cursor), and the repo's `text` and `userSafe` helpers (used as before).

## Try it

1. In ChatGPT with wovain connected, connect Fourthwall and ask for a tee design.
2. The agent starts with `fourthwall` `ecommerce_get-current-shop` and goes on to the catalog and mockups.

## Departures from the plan

None.
