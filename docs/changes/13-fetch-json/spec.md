# Spec: one upstream JSON fetch helper

Intent: [intent.md](intent.md)

## Requirements

- `lib/fetch-json.ts` exports `fetchJson(url, schema, { label, timeoutMs, ...init })`, returning the parsed body.
- A non-ok answer throws `"<label> answered <status>"`, plus `": <reason>"` when the body has `error.message` (Meta's shape).
- `fal-pricing`, `fal-usage` and `meta-graph` call it and keep their labels and timeouts (10 s, 15 s, 20 s).
- `lib/fetch-image.ts` exports `uploadArtwork(url, bytes, contentType)`; `assertUploadUrl` becomes private to it.
- `put_artwork` calls `uploadArtwork()` only.

## Design

- Reuse: zod (already a dependency) for both the parse and the error-body shape. Checked and not used: `ky`/`ofetch` (not installed, would be a new dependency for about 15 lines), `hono/client` (for calling our own routes), the Meta Ads MCP (cannot create rules, per AGENTS.md).
- `uploadArtwork` keeps the signed-upload headers and the 60 s timeout, and sets the length range from `bytes.byteLength`, which equals the stored `artwork.bytes`.
- `downloadImage` stays as is: it follows redirects by hand and streams with a cap, so `fetchJson` does not fit.

## Areas of concern

- Security: `uploadArtwork` still runs the public-HTTPS and Fourthwall-bucket checks before any bytes leave. The integration test for refusing other hosts and buckets covers it.
- Error text for Meta: unchanged, except a non-JSON error body now reads as a plain status error instead of a JSON parse error.
