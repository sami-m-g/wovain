# Intent: one upstream JSON fetch helper

Issue: #13

## Problem

`fal-pricing`, `fal-usage` and `meta-graph` each repeat fetch, `AbortSignal.timeout`, a `!ok` throw and a zod parse. The `put_artwork` tool does raw HTTP (a PUT to Fourthwall's bucket), which breaks the tool/lib layering.

## Desired outcome

- One `fetchJson(url, schema, init)` in `lib/` that the three callers use.
- `put_artwork` calls `uploadArtwork()` in `lib/fetch-image.ts`, next to the upload URL check, and does no HTTP itself.

## Constraints

- No retries, caching or timeout changes.
- Existing error messages keep their shape ("fal pricing answered 403", "Meta answered 400: reason").
- Old Firestore records still parse (no stored shapes change).
- Update `docs/spec.md` where the fact changes.

## Open questions

None.
