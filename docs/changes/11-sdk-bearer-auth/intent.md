# Intent: Use the MCP SDK bearer-auth gate instead of the hand-rolled one

Issue: #11

## Problem

The `/mcp` gate is our own code where the MCP SDK already has one:

- `auth.ts` parses the `Authorization` header with a regex and builds the 401 and its `WWW-Authenticate` header by hand.
- Two `Caller` interfaces (`auth/auth.ts` and `http.ts`) turn JWT claims into a `Caller` and then into the SDK's `AuthInfo`, across three files.
- `routes/mcp.ts` parses JSON-RPC by hand (`rpcOf`) to name the method and tool on the trace span.
- `findUser` ends in `.catch(() => null)`, so when WorkOS is down a merchant on the allowlist gets a 403 ("This account isn't allowed") with nothing logged.

## Desired outcome

- `/mcp` uses `requireBearerAuth` and `getOAuthProtectedResourceMetadataUrl` from `@modelcontextprotocol/server` 2.3.1. No regex Bearer parsing and no hand-built 401 remain.
- The verified `AuthInfo` goes straight to `handler.fetch`; both `Caller` interfaces are gone.
- The allowlist check still runs after the token check, on every call.
- `rpcOf` uses the SDK's `isJSONRPCRequest`.
- Only a WorkOS 404 (unknown user) counts as "not allowed". Any other WorkOS error is logged and rethrown, so the caller gets a 500 and the span records it.
- The change removes more lines than it adds, apart from the WorkOS error fix.

## Constraints

- `smoke:production` keeps passing: `POST /mcp` with no token answers 401, `/.well-known/oauth-protected-resource/mcp` names `$SITE/mcp` as its `resource` and AuthKit as its authorization server, and the bare `/.well-known/oauth-protected-resource` still serves the same document.
- The 401 keeps a `WWW-Authenticate: Bearer` challenge with `resource_metadata` pointing at the same URL, so existing MCP clients (ChatGPT, Claude) still find AuthKit.
- No change to the allowlist rules, the WorkOS setup or stored Firestore records.
- Update `docs/spec.md` where it names `requireMcpAuth` or describes the 401.

## Open questions

None that block the plan. Two behavior choices are listed under Risks in `plan.md` for approval.
