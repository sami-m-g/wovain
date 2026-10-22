# Plan: Drop the pages/ layer

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/src/app.ts`: inline the home page.
- `apps/server/src/pages/`: deleted.
- `apps/server/test/integration/app.test.ts`: test `GET /`.
- `.gitlab/CODEOWNERS`, `.config/dependency-cruiser.json`, `docs/spec.md`, `docs/app-map.html`: drop `pages/`.

## Order of work

1. Add the `GET /` test (passes before and after).
2. Inline the page, delete `pages/`.
3. Fix references, run checks.

## Risks

Visual drift in the page; the style keeps the same values. Not risky by the skill's criteria (no auth, infra, money, record shapes), so no approval stop. CODEOWNERS is under `.gitlab/` but the edit is a one-line path removal.

## Tests that prove it

`GET /` test; `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `build`.
