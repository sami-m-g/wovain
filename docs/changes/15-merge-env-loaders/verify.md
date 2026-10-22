# Verify: Merge the two env loaders

## Tests added

- `apps/server/test/unit/auth.test.ts` (`loadEnv`): the site URL defaults to localhost and loses its trailing slash, the icon URL follows the site unless set, and empty values and the allowlist parse as before.
- The sign-in and allowlist tests in the same file and the integration tests (`app`, `confirm`, `connect`, e2e `journey`) now load one env.

## Checks run

All pass: `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test` (364), `test:integration` (225, 1 skipped), `test:stories` (41), `build`, `test:e2e` (9, plus the widget proof).

Source lines (tests and docs aside): 94 added, 122 removed. The 57-line `auth/env.ts` is gone.

## Review findings

- Self-review against `/simplify`'s checklist: `isAllowed` had one caller, so it folded into `allowed`; the icon is now always set, so `server.ts` drops its conditional. The `pr-review-toolkit` agents aren't installed in this session.
- Security: the allowlist parse is unchanged, a user must still be found and verified, and sign-in stays off until both WorkOS keys are set (the `refuses every token while sign-in is off` test).

## Try it

In the review app, add `/mcp` as a remote MCP server: sign-in, the connector icon and the connect and confirm links behave as before.

## Departures from the plan

`isAllowed` folded into `createAuth` instead of moving as a separate helper. `docs/app-map.html` doesn't name `auth/env.ts`, so only `docs/spec.md` changed.
