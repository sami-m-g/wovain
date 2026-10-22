# Plan: one upstream JSON fetch helper

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/src/lib/fetch-json.ts`: new helper.
- `apps/server/src/lib/fal-pricing.ts`, `fal-usage.ts`, `meta-graph.ts`: call it.
- `apps/server/src/lib/fetch-image.ts`: add `uploadArtwork`, make `assertUploadUrl` private.
- `apps/server/src/tools/design.ts`: `put_artwork` calls `uploadArtwork`.
- `apps/server/test/unit/fetch-json.test.ts`: new tests.
- `docs/spec.md`: lib listing.

## Order of work

1. Add `fetchJson` and its tests.
2. Move the three callers onto it.
3. Add `uploadArtwork`, switch `put_artwork`.
4. Update `docs/spec.md`, run all checks.

## Risks

- The change adds a helper file, so the net line count may not go down. Reported in the MR if so.
- A changed error message would break a caller that matches on it; no caller or test does.

## Tests that prove it

- New unit tests: parsed body, status error, Meta-style reason, schema failure.
- Existing `fal-pricing`, `fal-usage` and the `put_artwork` integration tests (host and bucket refusal, header match).
- `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `build`.
