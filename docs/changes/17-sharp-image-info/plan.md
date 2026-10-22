# Plan: Replace the hand-rolled image header parser with sharp

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/package.json`, `pnpm-lock.yaml`: `sharp` 0.35.5, exact.
- `pnpm-workspace.yaml`: `sharp` in `allowBuilds`.
- `apps/server/src/lib/image.ts`: `sharp(...).metadata()` behind a loader allowlist.
- `apps/server/src/tools/design.ts`: awaits `readImageInfo`.
- `apps/server/test/unit/image.test.ts`: async, plus a blocked SVG.
- `docs/spec.md`: sharp in the stack table.

## Order of work

1. Add sharp and rewrite `image.ts`.
2. Update the caller and the tests.
3. Build, start the server like production, and run every check.

## Risks

- The Linux binary: CI installs on Linux with scripts off, as App Hosting does, and runs the unit tests; the deploy's smoke test starts the real server.

## Tests that prove it

The existing fixtures (PNG with and without alpha, JPEG, lossless, lossy and alpha WebP) and a blocked SVG; `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `test:stories`, `build` and `test:e2e`.
