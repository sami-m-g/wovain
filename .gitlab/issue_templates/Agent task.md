<!-- A task written for the Duo developer flow (issue → merge request). Be concrete: the agent only knows what is written here and in the repo. Once accepted, the agent turns it into docs/changes/<n>-<slug>/ (see docs/changes/README.md); Goal is the problem, Acceptance criteria the desired outcome. -->

## Goal

<!-- One sentence: the change to make and why. -->

## Acceptance criteria

<!-- Checkable statements. The agent should not open the MR until all of them hold. -->

- [ ]
- [ ]
- [ ] `pnpm run check`, `pnpm run check-types`, `pnpm run knip` and `pnpm run build` pass

## Files likely involved

<!-- Paths or packages, e.g. packages/api/src/routers/index.ts, apps/web/src/app/dashboard/page.tsx. -->

-

## Constraints

- Follow AGENTS.md (TypeScript only, Ultracite style, Conventional Commit titles).
- Schema changes ship a Drizzle migration (`pnpm run db:generate`); never edit `packages/db/src/migrations` by hand.

## Out of scope

<!-- What the agent must not touch (secrets, CI variables, other features). -->

-

/label ~"agent::duo"
