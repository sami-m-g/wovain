# Plan: Use the MCP SDK bearer-auth gate instead of the hand-rolled one

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/src/auth/auth.ts`: SDK verifier and gate, `orNullIfMissing` for WorkOS errors, `requireMcpAuth` that hands `AuthInfo` on, no `Caller` and no regex. Both outages (WorkOS lookup, AuthKit key fetch) go through one `rethrowOutage` that logs the error's class and status and rethrows. `createAuth` no longer returns `metadataUrl`, which nothing outside it reads now.
- `apps/server/src/http.ts`: drop `Caller`; `createMcpFetch` takes `AuthInfo`.
- `apps/server/src/routes/mcp.ts`: pass `mcpFetch` straight to `requireMcpAuth`, drop `stringOf` and the claim mapping, and make `rpcOf` use `isJSONRPCRequest`.
- `apps/server/test/unit/auth.test.ts`: the 401 header check becomes `toContain` on `resource_metadata="..."`. New cases: an expired token gets 401, `client_id` and `scope` reach `AuthInfo`, a non-404 WorkOS error is rethrown (handler not called), and `orNullIfMissing` maps `NotFoundException` to `null` and rethrows anything else.
- `apps/server/test/integration/http.test.ts`: `caller()` builds an `AuthInfo` (`extra.userId`, `expiresAt`).
- `apps/server/test/integration/app.test.ts`: assertions already use `toContain`, so no change expected. Rerun it.
- `docs/spec.md`: the "Token check" row and the `routes/mcp.ts` line in the file tree name `requireBearerAuth`, and the "Discovery" row mentions the `invalid_token` challenge.

## Order of work

1. Move the issue to `status::doing`.
2. Rewrite `auth.ts` (verifier, gate, `orNullIfMissing`, `requireMcpAuth`).
3. Update `http.ts` and `routes/mcp.ts` to pass `AuthInfo` through, then run `pnpm typecheck`.
4. Update the unit tests and add the new cases, then run `pnpm test`.
5. Update `http.test.ts`, then run `pnpm test:integration` (Firestore and Storage emulators).
6. Update `docs/spec.md`.
7. Run all the checks: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test`, `pnpm test:integration`, `pnpm build`. Compare `git diff --stat` against the line budget.
8. Run `/simplify`, the code-simplifier and the silent-failure-hunter review, then write `verify.md`, push, and open the MR.

## Risks

- **The 401 changes shape (approve).** The challenge becomes `Bearer error="invalid_token", error_description="...", resource_metadata="..."` and the body becomes OAuth error JSON instead of "Sign in to use wovain.". The status and the metadata URL stay the same. If a client depends on the bare challenge, sign-in breaks. Watch for it: `smoke:production` after deploy, then a manual reconnect from ChatGPT on the review app.
- **JWKS outages become 500, not 401 (approve).** Today any `jwtVerify` failure, including a failure to fetch AuthKit's JWKS, answers 401, which sends the agent back through sign-in. With this plan only jose's `JOSEError` (bad, expired or wrongly addressed token, no matching key, JWKS timeout) is a 401, and a network failure fetching the JWKS is a 500. This is the same rule as the WorkOS fix. The other option is to map every verify failure to 401 as today.
- **WorkOS outages become 500, not 403.** This is the fix the issue asks for. An allowlisted merchant sees a server error during a WorkOS outage instead of "not allowed". The unit test covers it.
- **Tokens without `exp` are refused.** The SDK requires `expiresAt`. AuthKit access tokens carry `exp`, so nothing should change. A 401 for a signed-in merchant on the review app would point here.
- **Line budget.** Removing the regex, both `Caller` types, `stringOf` and the hand-written 401 should remove about 45 lines. The new tests add lines, and the issue's line rule exempts tests only through "except this issue's behavior fix". `verify.md` will report the source-only numbers.

## Tests that prove it

- Unit (`pnpm test`): no token, a malformed header, a wrong audience, a wrong issuer and an expired token each get 401 with `resource_metadata`. A valid allowlisted token reaches the handler with `extra.userId`, `clientId` and `scopes`. Unlisted, unverified and unknown users get 403. A WorkOS non-404 error is rethrown and the handler isn't called. `orNullIfMissing` returns `null` for `NotFoundException` and rethrows anything else. The metadata document is unchanged.
- Integration (`pnpm test:integration`): `app.test.ts` gets 401 with `resource_metadata` on `/mcp` and the same document on both metadata paths. `http.test.ts` covers the real MCP client over `createMcpFetch` with `AuthInfo`, per-merchant isolation, and the refusal without a merchant.
- `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm build`.
- After merge: `smoke:production` (401 on `/mcp`, both metadata URLs, AuthKit CIMD and DCR).
