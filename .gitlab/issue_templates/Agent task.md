<!-- A task written for the Duo developer flow (issue → merge request). Be concrete: the agent only knows what is written here and in the repo. -->

## Goal

<!-- One sentence: the change to make and why. -->

## Acceptance criteria

<!-- Checkable statements. The agent should not open the MR until all of them hold. -->

- [ ]
- [ ]
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm test:integration` and `pnpm build` pass

## Files likely involved

<!-- Paths or packages, e.g. apps/server/src/tools/design.ts, apps/server/src/store.ts. -->

-

## Constraints

- Follow AGENTS.md (TypeScript only, Ultracite style, Conventional Commit titles).
- Record shapes are zod schemas (`packages/shared`, `apps/server/src/store.ts`); Firestore has no migrations, so old records must still parse.
- Planning docs (`docs/*.md`) change wherever the fact appears.

## Out of scope

<!-- What the agent must not touch (secrets, CI variables, other features). -->

-

/label ~"agent::duo"
