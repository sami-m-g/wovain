# Verify: Use the MCP SDK bearer-auth gate instead of the hand-rolled one

## Tests added

`apps/server/test/unit/auth.test.ts`:

- No token and a `Basic` header each get 401 with `Bearer error="invalid_token", ..., resource_metadata="<site>/.well-known/oauth-protected-resource/mcp"`.
- A valid allowlisted token reaches the handler with `extra.userId`, `clientId` (from `client_id`) and `scopes` (from `scope`).
- An expired token gets 401.
- Sign-in off (no WorkOS keys) gets 401 even for a well-signed token.
- AuthKit's keys failing to fetch (a non-jose error) gets 500.
- A WorkOS failure other than 404 during the allowlist check is rethrown. The handler isn't reached and there's no 403.
- `orNullIfMissing` returns `null` for `NotFoundException` and rethrows anything else.

The existing cases (wrong audience or issuer 401; unlisted, unverified or unknown user 403; the metadata document) still pass.

`apps/server/test/integration/http.test.ts`: the test caller is now an SDK `AuthInfo` (`extra.userId`). `app.test.ts` is unchanged and passes: 401 with `resource_metadata` on `/mcp`, and the same document on both metadata paths.

## Checks run

All pass (exit 0) after the review fixes:

- `pnpm check`
- `pnpm typecheck`
- `pnpm knip`
- `pnpm arch` (no violations, 86 modules)
- `pnpm dupes` (0 clones)
- `pnpm test` (60 passed)
- `pnpm test:integration` (37 passed, on the Firestore and Storage emulators)
- `pnpm build`

Line count in `apps/server/src`: 93 added and 82 removed. About 25 of the added lines are the outage handling the issue asks for (`rethrowOutage`, `orNullIfMissing` and the jose error mapping). Without them the source shrinks by about 14 lines.

## Review findings

`/simplify` ran four reviewers:

- Reuse:
  - Optional: `buildOAuthProtectedResourceMetadata`/`oauthMetadataResponse` could serve the metadata document. Skipped, as decided in the spec. They need AuthKit's full `OAuthMetadata`, drop `bearer_methods_supported`, throw when no issuer is set, and would serve `/.well-known/oauth-authorization-server`, which belongs to AuthKit.
- Simplification:
  - `metadataUrl` was returned from `createAuth` but unused. Removed.
  - The test files repeated request-building code. Fixed: `call` and `statusOf` take an optional gate, and the two 401 cases became one `test.each`.
  - Suggested a type assertion for `status`. Skipped: the lint rule `no-unsafe-type-assertion` forbids it.
  - Suggested a typed `userIdOf` helper. Skipped: the verifier always sets `extra.userId`.
- Efficiency: none.
- Altitude:
  - Suggested moving the allowlist into the verifier as an `OAuthError`. Skipped: the SDK's only 403 is `insufficient_scope`, which tells clients to ask for more scopes. That's wrong for an allowlist refusal and could start re-consent loops.
  - Suggested dropping the outage `console.error`, since the span records the error type. Kept: the span drops the HTTP status, and nothing is traced without a registered provider.

The `pr-review-toolkit:code-simplifier` and `pr-review-toolkit:silent-failure-hunter` agents aren't installed in this session. `/simplify` covered the simplifier's angle, and I did the silent-failure pass by hand. It found one problem: a JWKS fetch failure became the SDK's 500 with nothing logged. Fixed by sending it through `rethrowOutage`, so it's logged like the WorkOS case. The remaining catches are deliberate: `rpcOf`'s `.catch(() => null)` on a body that isn't JSON (tracing only), and jose errors mapped to `invalid_token`.

## Try it

1. In the review app, `curl -s -i -X POST <review-app>/mcp`. Expect a 401 whose `WWW-Authenticate` includes `resource_metadata="<review-app>/.well-known/oauth-protected-resource/mcp"`.
2. `curl -s <review-app>/.well-known/oauth-protected-resource/mcp` and the bare `/.well-known/oauth-protected-resource`. Both name `<review-app>/mcp` and the AuthKit domain.
3. Add `<review-app>/mcp` as a remote MCP server in ChatGPT or Claude, sign in with an allowlisted email, and call `get_settings`.
4. After merge, `smoke:production` checks steps 1 and 2 against production.

## Departures from the plan

- `rpcOf` accepts JSON-RPC notifications as well as requests (`isJSONRPCNotification`), so spans keep `mcp.method` for notifications as before.
- One `rethrowOutage` helper logs both outage paths. The plan only covered logging for WorkOS.
- `createAuth` no longer returns `metadataUrl`.
