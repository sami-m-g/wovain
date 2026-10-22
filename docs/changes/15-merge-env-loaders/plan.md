# Plan: Merge the two env loaders

Spec: [spec.md](spec.md)

## Files that change

- `apps/server/src/env.ts`: the auth keys, the site URL and the icon transform.
- `apps/server/src/auth/env.ts`: deleted.
- `apps/server/src/auth/auth.ts`: takes `Env`; holds `isAllowed` and `AllowCheck`.
- `apps/server/src/runtime.ts`, `app.ts`: one `env`, no `authEnv`.
- Tests that call `loadAuthEnv` or set `authEnv`: use `loadEnv`.
- `docs/spec.md`, `docs/app-map.html`: wherever they name `auth/env.ts`.

## Order of work

1. Merge the schemas in `env.ts`, with a unit test for the site and icon URLs.
2. Move the allowlist helpers into `auth.ts` and delete `auth/env.ts`.
3. Update the runtime, the app and the tests, then the docs.

## Risks

- A missed `authEnv` reference: typecheck catches it.
- A changed allowlist or sign-in rule: `auth.test.ts` and the integration tests catch it.

## Tests that prove it

`pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `test:stories`, `build` and `test:e2e`, plus a unit test for the derived URLs.
