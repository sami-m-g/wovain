# Plan: fourthwall proxy fails on get-instructions, blocking the design flow

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/test/fixtures/fourthwall-tools.json`: Fourthwall's real tool names.
- `apps/server/test/unit/fourthwall-tools.test.ts`: playbook, instruction, allowlist and `lib/` names against the allowlist and the fixture.
- `apps/server/test/integration/connect.test.ts`: the recovery reply, and `get-instructions` refused before any upstream call.
- `apps/server/src/lib/upstream.ts`: `callTool`, `missingTool`, `toolNames`; `allowed` on `UpstreamRequest`.
- `apps/server/src/tools/connections.ts`: allowlist, description, `allowed`.
- `apps/server/src/playbooks/design.ts`: step 1.
- `AGENTS.md`, `docs/spec.md`: the Fourthwall preamble.

## Order of work

1. The fixture and the unit test, which fail on `get-instructions` in the design playbook and the allowlist.
2. Allowlist, description and playbook.
3. The recovery reply and its integration test.
4. Docs.

## Risks

- Fourthwall adds or drops tools again: the fixture goes stale. The recovery reply covers the agent at run time; refresh the fixture from `tools/list` when the playbooks change.

## Tests that prove it

`pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `test:e2e`, `build`.
