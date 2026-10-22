# Verify: one upstream JSON fetch helper

## Tests added

- `apps/server/test/unit/fetch-json.test.ts`: parsed body, status error with the label, Meta-style reason appended, schema failure rejects.
- Existing coverage kept: `fal-pricing`, `fal-usage` unit tests and the `put_artwork` integration tests (refuses other hosts and buckets, header match).

## Checks run

`pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration` and `build` all pass.

## Review findings

The pr-review-toolkit and feature-dev agents were not available, so the review used `/simplify` with four general-purpose agents (reuse, simplification, efficiency, altitude).

- Simplification: comment on the Meta-specific error shape was unclear. Reworded.
- Altitude: the `error.message` extraction is provider-specific logic in a generic helper. Kept on purpose, since it avoids per-caller error plumbing; other upstreams just report the status.
- Silent failure: `.catch(() => null)` on an error body only drops the reason, never the status. Benign.
- Timeout on upload: `TIMEOUT_MS` is 60 000, the same as the old inline value.
- Efficiency: clean.

## Try it

Run `pnpm test` and `pnpm test:integration`. In the review app, stage artwork and call `put_artwork` with a Fourthwall upload link: it should upload as before, and a link to another host or bucket is refused.

## Departures from the plan

The diff does not remove more source lines than it adds, because the new helper file and the moved upload function add lines. The three callers and `put_artwork` do shrink.
