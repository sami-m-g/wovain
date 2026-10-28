# Tasks

## 1. Run workflow

- [x] 1.1 Add the `ideas` suspend step to the Mastra workflow and `approveIdeas` to `RunEngine` (durable, legacy, router); verified by `pnpm --filter @wovain/api test`
- [x] 1.2 `approveIdeas` flow: validate ideas, guarded move to `design`, resume, undo on failure; tests in `durable.test.ts`
- [x] 1.3 Open the design gate only at step `approval`; test in `durable.test.ts`

## 2. Surfaces

- [x] 2.1 `runs.approveIdeas` procedure with `RUN_NOT_AT_IDEAS`, and the MCP tool `approve_ideas`; verified by `pnpm run check-types`
- [x] 2.2 Wizard: **See designs** calls `runs.approveIdeas` at the ideas gate; copy in en, es, fr; verified by `pnpm run check-types` and `pnpm run check`

## 3. Docs

- [x] 3.1 Update `docs/prd.md`, `docs/spec.md` and their docs-site copies; verified by `pnpm run spec:validate`

## Workflow follow-up

- Archive the change in this PR (`openspec archive gate-designs-on-approved-ideas`).
