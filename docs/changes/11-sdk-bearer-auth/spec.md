# Spec: Use the MCP SDK bearer-auth gate instead of the hand-rolled one

Intent: [intent.md](intent.md)

## Requirements

1. `/mcp` without a token, with a malformed header, or with a token AuthKit didn't sign for `<site>/mcp` answers 401 with `WWW-Authenticate: Bearer ..., resource_metadata="<site>/.well-known/oauth-protected-resource/mcp"`.
2. While `WORKOS_AUTHKIT_DOMAIN` or `WORKOS_API_KEY` is unset, every `/mcp` call still answers 401.
3. A valid token for a verified, allowlisted email reaches the tools, and the tools see its user id as `authInfo.extra.userId`.
4. A valid token for an unlisted, unverified or unknown (WorkOS 404) user answers 403, as today.
5. A WorkOS error other than 404 is logged (error class and status only, no user id or email) and rethrown, so `/mcp` answers 500 and the span is marked as an error.
6. Both metadata paths serve the same document as today: `resource`, `authorization_servers`, `bearer_methods_supported`.
7. The `mcp.request` span still records `mcp.method` and `mcp.tool`, now read through `isJSONRPCRequest`.
8. No `Caller` type remains. `createMcpFetch` takes the SDK's `AuthInfo`.

## Design

SDK exports, checked in `apps/server/node_modules/@modelcontextprotocol/server` 2.3.1 (`dist/index.d.mts`, implementation in `dist/mcp-DIH4cS6P.mjs`):

```ts
requireBearerAuth(options: VerifyBearerTokenOptions): (request: Request) => Promise<AuthInfo | Response>
// VerifyBearerTokenOptions = { verifier: OAuthTokenVerifier; requiredScopes?: string[];
//   resourceMetadataUrl?: string; expectedResource?: URL }
getOAuthProtectedResourceMetadataUrl(serverUrl: URL): string
// new URL("https://x/mcp") -> "https://x/.well-known/oauth-protected-resource/mcp"
interface OAuthTokenVerifier { verifyAccessToken(token: string): Promise<AuthInfo> }
isJSONRPCRequest(value: unknown): value is JSONRPCRequest
OAuthError, OAuthErrorCode   // throw new OAuthError(OAuthErrorCode.InvalidToken, msg)
type AuthInfo = { token; clientId; scopes; expiresAt?; resource?: URL; resourceMetadataUrl?; extra? }
```

How the gate behaves (from the implementation): it takes the first comma-separated `authorization` value, requires `Bearer <token>`, calls the verifier, compares `authInfo.resource` with `expectedResource`, and rejects a missing or past `expiresAt`. `OAuthError(InvalidToken)` becomes 401 with `WWW-Authenticate: Bearer error="invalid_token", error_description="...", resource_metadata="..."` and a JSON body. Any error that isn't an `OAuthError` becomes `500 server_error`.

`src/auth/auth.ts`:

- `createAuth(env, deps?)` keeps its signature and returns `{ allowed, gate, metadata, metadataUrl }`.
  - `resource = new URL(`${site}/mcp`)` and `metadataUrl = getOAuthProtectedResourceMetadataUrl(resource)`.
  - `metadata` stays the hand-built object. `buildOAuthProtectedResourceMetadata` would drop `bearer_methods_supported` and throws when no issuer is set, which the local "auth off" mode needs.
  - The verifier wraps the existing `jwtVerify(token, keys, { audience, issuer })`. With auth off it throws `OAuthError(InvalidToken)`. A jose `errors.JOSEError` (bad signature, wrong issuer or audience, expired, no matching key) becomes `OAuthError(InvalidToken)`. Anything else, such as a JWKS network failure, propagates and the SDK turns it into 500. A token with no `sub` is `InvalidToken`.
  - It returns `{ token, clientId: client_id ?? azp ?? "", scopes: scope.split(" "), expiresAt: exp, resource, extra: { userId: sub } }`. The `clientId` and `scopes` mapping moves here from `routes/mcp.ts`.
  - `gate = requireBearerAuth({ verifier, expectedResource: resource, resourceMetadataUrl: metadataUrl })`.
- `workosDeps.findUser` catches only `NotFoundException` from `@workos-inc/node` and returns `null`. Other errors are logged with `console.error` (class name and HTTP status) and rethrown. The rule sits in a small exported `orNullIfMissing(error)` helper so a unit test can cover it without a WorkOS client.
- `requireMcpAuth(auth, handler)` becomes: `const info = await auth.gate(request)`. A `Response` is returned as is. Next comes the allowlist check on `info.extra.userId` (403 as today), then `handler(request, info)`. `handler` is `(request: Request, authInfo: AuthInfo) => Promise<Response>`.
- The `Caller` interface and the regex are deleted.

`src/http.ts`: delete `Caller`. `createMcpFetch` returns `(request, authInfo: AuthInfo) => handler.fetch(request, { authInfo })`.

`src/routes/mcp.ts`: `requireMcpAuth(auth, mcpFetch)`. Delete `stringOf` and the claim mapping. `rpcOf` parses the cloned body and, when `isJSONRPCRequest(body)` holds, reads `body.method` and `body.params?.name` when it's a string.

`src/app.ts`: no change. It already serves `auth.metadata` on both paths.

Libraries checked: the SDK's `requireBearerAuth`, `verifyBearerToken`, `bearerAuthChallengeResponse`, `getOAuthProtectedResourceMetadataUrl`, `buildOAuthProtectedResourceMetadata`, `oauthMetadataResponse` and `isJSONRPCRequest`; jose `errors.JOSEError`; `@workos-inc/node`'s `NotFoundException`. `oauthMetadataResponse` would also serve `/.well-known/oauth-authorization-server`, which we don't own (AuthKit does), and it can't serve the bare path, so `app.ts` keeps its two Hono routes. The skill's `feature-dev:code-architect` agent isn't available in this session, so the design comes from reading the SDK types and implementation directly.

## Areas of concern

- **Client compatibility.** The 401 challenge gains `error="invalid_token"` and `error_description`, and the body changes from plain text to OAuth error JSON. RFC 6750 allows the extra parameters. MCP clients read `resource_metadata`, which stays at the same URL, and the SDK's own client is built for this exact header. `smoke:production` checks only the status and the metadata documents.
- **Security.** The audience is checked twice, by `jwtVerify` and by `expectedResource`. The gate now rejects tokens with no `exp`. AuthKit always sets `exp`, so this only tightens the check. The allowlist still runs on every call, after the token check.
- **Logging.** The WorkOS error log carries only the error's class and status, never the user id, email or token, matching the span policy in `routes/mcp.ts`.
- **Records.** No Firestore shape changes, so nothing needs a migration.
