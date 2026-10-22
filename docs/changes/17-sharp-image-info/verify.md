# Verify: Replace the hand-rolled image header parser with sharp

## Tests added

- `apps/server/test/unit/image.test.ts` now awaits `readImageInfo` on the same fixtures: PNG with and without alpha, JPEG, and lossless, lossy and alpha WebP. A new case shows an SVG resolves `undefined`.
- By hand: an SVG passed straight to sharp after `lib/image.ts` loads is refused ("unsupported image format"), so the loader block works. A palette PNG without `tRNS` reads as opaque.

## Checks run

All pass: `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration` (226), `test:stories` (41), `build`, `test:e2e` (9, plus the widget proof).

Production-like start: `pnpm build`, then `pnpm start` with `WOVAIN_BUCKET` set. The server came up, `/` answered 200 and `/mcp` 401, with sharp loaded through `tools/design.ts`.

Linux: sharp 0.35.5 has no install script, and `pnpm-lock.yaml` records every `@img/sharp-*` optional package, including `@img/sharp-linux-x64` and `@img/sharp-libvips-linux-x64`. CI installs on Linux with scripts off, as App Hosting does, and runs the unit tests against the real binary. After the merge, the production deploy's smoke test starts the server on App Hosting.

Source lines (tests, docs and the lockfile aside): 36 added, 87 removed.

## Review findings

- Self-review: the formatter rewrote `.catch(() => undefined)` into an empty function, so the read uses `try`/`catch`. Any read error becomes `undefined`, which `put_artwork` reports as "the image isn't a PNG, JPEG or WebP", as before. The `pr-review-toolkit` agents aren't installed in this session.
- Security: libvips loaders other than PNG, JPEG and WebP buffers are blocked process-wide. `metadata()` reads headers without decoding pixels.

## Try it

In the review app, stage artwork with `put_artwork` from a PNG with transparency and from a JPEG: the saved record shows the right size and `transparent`.

## Departures from the plan

None.
