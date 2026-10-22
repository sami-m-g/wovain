# Spec: Merge the two env loaders

Intent: [intent.md](intent.md)

## Requirements

- `apps/server/src/env.ts` holds the only env schema and the only loader, `loadEnv`.
- `WOVAIN_SITE_URL` parses to the origin without a trailing slash, or `http://localhost:3000` when unset.
- `WOVAIN_ICON_URL` falls back to `${WOVAIN_SITE_URL}/icon.png` through a zod transform; an explicit value still wins.
- `auth/env.ts` is gone. `isAllowed` and `AllowCheck` move into `auth/auth.ts`, the one file that uses them.
- `Runtime` drops `authEnv`; `createAuth` and `createApp` read `env`.

## Design

- Add `WORKOS_API_KEY`, `WORKOS_AUTHKIT_DOMAIN`, `WOVAIN_ALLOWED_EMAILS` (same set transform) and `WOVAIN_SITE_URL` (`z.url().default(...)` plus a transform that trims the slash) to `envSchema`, then `.transform()` the object to fill `WOVAIN_ICON_URL`.
- `siteUrl(env)` becomes `env.WOVAIN_SITE_URL`.
- No new library: zod already handles defaults and transforms.

## Areas of concern

- Security: the allowlist parse and the rule that sign-in stays off until both keys are set are copied unchanged. `test/unit/auth.test.ts` keeps covering them.
- Tests that load an empty env now get the localhost icon, which production already had.
